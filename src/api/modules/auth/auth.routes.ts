import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { config } from '../../../config'
import { authenticate } from '../../middleware/authenticate'
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
} from './auth.service'
import { AppError } from '../../../shared/types/errors'

// ─── Schema definitions ───────────────────────────────────────────────────────

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: {
        type: 'string',
        minLength: 10,
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$',
      },
    },
  },
} as const

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },
} as const

// ─── Route plugin ─────────────────────────────────────────────────────────────

export const registerAuthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/auth/register
  fastify.post('/register', { schema: registerSchema }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string }

    const result = await registerUser(
      { db: fastify.db, redis: fastify.redis, jwt: fastify.jwt },
      email,
      password,
    )

    if (!result.ok) {
      throw result.error
    }

    return reply.status(201).send({
      user_id: result.data.id,
      email: result.data.email,
    })
  })

  // POST /api/auth/login
  fastify.post('/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string }
    const ipAddress =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      request.socket.remoteAddress

    const result = await loginUser(
      { db: fastify.db, redis: fastify.redis, jwt: fastify.jwt },
      email,
      password,
      ipAddress,
    )

    if (!result.ok) {
      throw result.error
    }

    const { accessToken, refreshToken } = result.data

    void reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    })

    return reply.status(200).send({ access_token: accessToken })
  })

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const rawRefreshToken = request.cookies['refresh_token']

    if (!rawRefreshToken) {
      throw new AppError(
        (await import('../../../shared/types/errors')).ErrorCode.TOKEN_INVALID,
        'No refresh token provided',
        401,
      )
    }

    const result = await refreshAccessToken(
      { db: fastify.db, redis: fastify.redis, jwt: fastify.jwt },
      rawRefreshToken,
    )

    if (!result.ok) {
      throw result.error
    }

    const { accessToken, refreshToken } = result.data

    void reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    })

    return reply.status(200).send({ access_token: accessToken })
  })

  // POST /api/auth/logout
  fastify.post(
    '/logout',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const rawRefreshToken = request.cookies['refresh_token']

      if (rawRefreshToken) {
        const result = await logoutUser(
          { db: fastify.db, redis: fastify.redis, jwt: fastify.jwt },
          rawRefreshToken,
        )
        if (!result.ok) {
          throw result.error
        }
      }

      void reply.clearCookie('refresh_token', {
        path: '/api/auth',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
      })

      return reply.status(204).send()
    },
  )
}
