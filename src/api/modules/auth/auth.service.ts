import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type { Pool } from 'pg'
import type Redis from 'ioredis'
import type { JwtPlugin } from '../../plugins/jwt'
import { authRepository } from './auth.repository'
import { AppError, ErrorCode } from '../../../shared/types/errors'
import { type Result, ok, err } from '../../../shared/utils/result'
import { config } from '../../../config'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthDeps {
  db: Pool
  redis: Redis
  jwt: JwtPlugin
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function bruteForceKey(email: string): string {
  return `bf:login:${email.toLowerCase()}`
}

/**
 * Parse a JWT expiry string (e.g. "30d", "15m") into a Date.
 * Only handles the `d` (days) and `m` (minutes) suffixes used in this project.
 */
function expiryStringToDate(expiry: string): Date {
  const now = Date.now()
  const match = expiry.match(/^(\d+)([mdhMs]+)$/)
  if (!match) return new Date(now + 30 * 24 * 60 * 60 * 1000) // default 30d

  const [, amtStr, unit] = match
  const amt = parseInt(amtStr ?? '30', 10)

  switch (unit) {
    case 'm':
      return new Date(now + amt * 60 * 1000)
    case 'h':
      return new Date(now + amt * 60 * 60 * 1000)
    case 'd':
      return new Date(now + amt * 24 * 60 * 60 * 1000)
    default:
      return new Date(now + 30 * 24 * 60 * 60 * 1000)
  }
}

// ─── Service functions ───────────────────────────────────────────────────────

export async function registerUser(
  deps: AuthDeps,
  email: string,
  password: string,
): Promise<Result<{ id: string; email: string }>> {
  const normalizedEmail = email.toLowerCase().trim()

  const existing = await authRepository.findUserByEmail(deps.db, normalizedEmail)
  if (existing) {
    return err(
      new AppError(ErrorCode.DUPLICATE_EMAIL, 'An account with this email already exists', 409),
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await authRepository.createUser(deps.db, normalizedEmail, passwordHash)

  return ok({ id: user.id, email: user.email })
}

export async function loginUser(
  deps: AuthDeps,
  email: string,
  password: string,
  ipAddress?: string,
): Promise<Result<{ accessToken: string; refreshToken: string }>> {
  const normalizedEmail = email.toLowerCase().trim()
  const bfKey = bruteForceKey(normalizedEmail)

  // 1. Brute force check
  const attemptCountRaw = await deps.redis.get(bfKey)
  const attemptCount = attemptCountRaw ? parseInt(attemptCountRaw, 10) : 0

  if (attemptCount >= config.BF_MAX_ATTEMPTS) {
    return err(
      new AppError(
        ErrorCode.ACCOUNT_LOCKED,
        'Account temporarily locked due to too many failed login attempts. Please try again later.',
        423,
      ),
    )
  }

  // 2. Look up user — timing-safe: always run bcrypt even if user doesn't exist
  const user = await authRepository.findUserByEmail(deps.db, normalizedEmail)

  if (!user) {
    // Timing attack mitigation: compare against a dummy hash
    await bcrypt.compare(
      password,
      '$2b$12$invalidhashfortimingprotection0000000000000000000000000',
    )
    await authRepository.recordLoginAttempt(deps.db, normalizedEmail, false, ipAddress)
    return err(
      new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password', 401),
    )
  }

  // 3. Verify password
  const passwordValid = await bcrypt.compare(password, user.password_hash)

  if (!passwordValid) {
    // Increment brute force counter
    await deps.redis.incr(bfKey)
    await deps.redis.expire(bfKey, config.BF_WINDOW_SECONDS)
    await authRepository.recordLoginAttempt(deps.db, normalizedEmail, false, ipAddress)
    return err(
      new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password', 401),
    )
  }

  // 4. Success — clear brute force counter
  await deps.redis.del(bfKey)
  await authRepository.recordLoginAttempt(deps.db, normalizedEmail, true, ipAddress)

  // 5. Issue tokens
  const jti = uuidv4()
  const accessToken = deps.jwt.signAccessToken({ sub: user.id })
  const refreshToken = deps.jwt.signRefreshToken({ sub: user.id, jti })

  const tokenHash = hashToken(refreshToken)
  const expiresAt = expiryStringToDate(config.JWT_REFRESH_EXPIRES_IN)
  await authRepository.createRefreshToken(deps.db, user.id, tokenHash, expiresAt)

  return ok({ accessToken, refreshToken })
}

export async function refreshAccessToken(
  deps: AuthDeps,
  rawRefreshToken: string,
): Promise<Result<{ accessToken: string; refreshToken: string }>> {
  // 1. Verify JWT signature and expiry
  let payload: { sub: string; jti: string }
  try {
    payload = deps.jwt.verifyRefreshToken(rawRefreshToken)
  } catch (e) {
    if (e instanceof AppError) return err(e)
    return err(new AppError(ErrorCode.TOKEN_INVALID, 'Invalid refresh token', 401))
  }

  // 2. Look up token in DB by sha256 hash
  const tokenHash = hashToken(rawRefreshToken)
  const stored = await authRepository.findRefreshTokenByHash(deps.db, tokenHash)

  if (!stored) {
    // Token was revoked or already rotated — invalidate all tokens for this user (potential theft)
    await authRepository.deleteAllRefreshTokensForUser(deps.db, payload.sub)
    return err(new AppError(ErrorCode.TOKEN_INVALID, 'Refresh token not found or expired', 401))
  }

  // 3. Rotate: delete old token, issue new pair
  await authRepository.deleteRefreshToken(deps.db, tokenHash)

  const newJti = uuidv4()
  const newAccessToken = deps.jwt.signAccessToken({ sub: payload.sub })
  const newRefreshToken = deps.jwt.signRefreshToken({ sub: payload.sub, jti: newJti })

  const newTokenHash = hashToken(newRefreshToken)
  const expiresAt = expiryStringToDate(config.JWT_REFRESH_EXPIRES_IN)
  await authRepository.createRefreshToken(deps.db, payload.sub, newTokenHash, expiresAt)

  return ok({ accessToken: newAccessToken, refreshToken: newRefreshToken })
}

export async function logoutUser(
  deps: AuthDeps,
  rawRefreshToken: string,
): Promise<Result<null>> {
  // Best-effort: verify the token but still delete even if we only have the hash
  try {
    deps.jwt.verifyRefreshToken(rawRefreshToken)
  } catch {
    // Even an expired token should be cleaned up — continue to delete
  }

  const tokenHash = hashToken(rawRefreshToken)
  await authRepository.deleteRefreshToken(deps.db, tokenHash)

  return ok(null)
}
