import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  type AuthDeps,
} from './auth.service'
import { ErrorCode } from '../../../shared/types/errors'
import type { User, RefreshToken } from '../../../shared/types/domain'

// ─── Mock the repository ──────────────────────────────────────────────────────

vi.mock('./auth.repository', () => ({
  authRepository: {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn(),
    createRefreshToken: vi.fn(),
    findRefreshTokenByHash: vi.fn(),
    deleteRefreshToken: vi.fn(),
    deleteAllRefreshTokensForUser: vi.fn(),
    recordLoginAttempt: vi.fn(),
  },
}))

// ─── Mock config to avoid process.env requirements ───────────────────────────

vi.mock('../../../config', () => ({
  config: {
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'test-access-secret-min-32-chars-0000',
    JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-chars-000',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    BF_MAX_ATTEMPTS: 10,
    BF_WINDOW_SECONDS: 900,
  },
}))

import { authRepository } from './auth.repository'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: uuidv4(),
    email: 'test@example.com',
    password_hash: '',
    google_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }
}

function makeRefreshToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: uuidv4(),
    user_id: uuidv4(),
    token_hash: 'somehash',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
    ...overrides,
  }
}

function makeDeps(overrides: Partial<AuthDeps> = {}): AuthDeps {
  const redisMock = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    del: vi.fn().mockResolvedValue(1),
  }

  const jwtMock = {
    signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
    signRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
    verifyAccessToken: vi.fn(),
    verifyRefreshToken: vi.fn(),
  }

  return {
    db: {} as AuthDeps['db'],
    redis: redisMock as unknown as AuthDeps['redis'],
    jwt: jwtMock,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the new user on success', async () => {
    const userId = uuidv4()
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null)
    vi.mocked(authRepository.createUser).mockResolvedValue(
      makeUser({ id: userId, email: 'new@example.com' }),
    )

    const deps = makeDeps()
    const result = await registerUser(deps, 'new@example.com', 'Password1!')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.id).toBe(userId)
      expect(result.data.email).toBe('new@example.com')
    }
  })

  it('returns DUPLICATE_EMAIL error when email already exists', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(makeUser())

    const deps = makeDeps()
    const result = await registerUser(deps, 'existing@example.com', 'Password1!')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.DUPLICATE_EMAIL)
      expect(result.error.statusCode).toBe(409)
    }
  })
})

describe('loginUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('increments Redis counter and returns INVALID_CREDENTIALS on wrong password', async () => {
    const hash = await bcrypt.hash('CorrectPass1!', 12)
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(makeUser({ password_hash: hash }))
    vi.mocked(authRepository.recordLoginAttempt).mockResolvedValue()

    const deps = makeDeps()
    const result = await loginUser(deps, 'test@example.com', 'WrongPassword1!')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_CREDENTIALS)
      expect(result.error.statusCode).toBe(401)
    }

    expect(deps.redis.incr).toHaveBeenCalledWith(expect.stringContaining('bf:login:'))
    expect(deps.redis.expire).toHaveBeenCalled()
  })

  it('returns ACCOUNT_LOCKED after BF_MAX_ATTEMPTS failures', async () => {
    const redisMock = {
      get: vi.fn().mockResolvedValue('10'), // already at max
      set: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
      del: vi.fn(),
    }
    const deps = makeDeps({ redis: redisMock as unknown as AuthDeps['redis'] })

    const result = await loginUser(deps, 'test@example.com', 'AnyPassword1!')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.ACCOUNT_LOCKED)
      expect(result.error.statusCode).toBe(423)
    }
  })

  it('clears Redis counter and returns tokens on success', async () => {
    const hash = await bcrypt.hash('CorrectPass1!', 12)
    const user = makeUser({ password_hash: hash })
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(user)
    vi.mocked(authRepository.createRefreshToken).mockResolvedValue()
    vi.mocked(authRepository.recordLoginAttempt).mockResolvedValue()

    const deps = makeDeps()
    const result = await loginUser(deps, 'test@example.com', 'CorrectPass1!')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.accessToken).toBe('mock-access-token')
      expect(result.data.refreshToken).toBe('mock-refresh-token')
    }

    expect(deps.redis.del).toHaveBeenCalledWith(expect.stringContaining('bf:login:'))
  })

  it('returns INVALID_CREDENTIALS without revealing user existence for unknown email', async () => {
    vi.mocked(authRepository.findUserByEmail).mockResolvedValue(null)
    vi.mocked(authRepository.recordLoginAttempt).mockResolvedValue()

    const deps = makeDeps()
    const result = await loginUser(deps, 'nobody@example.com', 'Password1!')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_CREDENTIALS)
      // Must NOT say "user not found" or similar
      expect(result.error.message).toBe('Invalid email or password')
    }
  })
})

describe('refreshAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rotates tokens and returns new access/refresh tokens on valid token', async () => {
    const userId = uuidv4()
    const jti = uuidv4()

    const jwtMock = {
      signAccessToken: vi.fn().mockReturnValue('new-access-token'),
      signRefreshToken: vi.fn().mockReturnValue('new-refresh-token'),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn().mockReturnValue({ sub: userId, jti, type: 'refresh' }),
    }

    const storedToken = makeRefreshToken({ user_id: userId })
    vi.mocked(authRepository.findRefreshTokenByHash).mockResolvedValue(storedToken)
    vi.mocked(authRepository.deleteRefreshToken).mockResolvedValue()
    vi.mocked(authRepository.createRefreshToken).mockResolvedValue()

    const deps = makeDeps({ jwt: jwtMock })
    const result = await refreshAccessToken(deps, 'old-refresh-token')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.accessToken).toBe('new-access-token')
      expect(result.data.refreshToken).toBe('new-refresh-token')
    }

    expect(authRepository.deleteRefreshToken).toHaveBeenCalled()
    expect(authRepository.createRefreshToken).toHaveBeenCalled()
  })

  it('returns TOKEN_INVALID when JWT verification fails', async () => {
    const { AppError: ActualAppError } = await import('../../../shared/types/errors')
    const jwtMock = {
      signAccessToken: vi.fn(),
      signRefreshToken: vi.fn(),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn().mockImplementation(() => {
        throw new ActualAppError(ErrorCode.TOKEN_INVALID, 'Invalid refresh token', 401)
      }),
    }

    const deps = makeDeps({ jwt: jwtMock })
    const result = await refreshAccessToken(deps, 'invalid-token')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.TOKEN_INVALID)
    }
  })
})

describe('logoutUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the refresh token from the DB', async () => {
    const userId = uuidv4()
    const jti = uuidv4()

    const jwtMock = {
      signAccessToken: vi.fn(),
      signRefreshToken: vi.fn(),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn().mockReturnValue({ sub: userId, jti, type: 'refresh' }),
    }

    vi.mocked(authRepository.deleteRefreshToken).mockResolvedValue()

    const deps = makeDeps({ jwt: jwtMock })
    const result = await logoutUser(deps, 'valid-refresh-token')

    expect(result.ok).toBe(true)
    expect(authRepository.deleteRefreshToken).toHaveBeenCalled()
  })
})
