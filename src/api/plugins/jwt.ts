import fp from 'fastify-plugin'
import * as jsonwebtoken from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../../config'
import { AppError, ErrorCode } from '../../shared/types/errors'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string
  type: 'access'
}

export interface RefreshTokenPayload {
  sub: string
  jti: string
  type: 'refresh'
}

export interface JwtPlugin {
  signAccessToken(payload: { sub: string }): string
  signRefreshToken(payload: { sub: string; jti: string }): string
  verifyAccessToken(token: string): AccessTokenPayload
  verifyRefreshToken(token: string): RefreshTokenPayload
}

// ─── Module augmentation ─────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    jwt: JwtPlugin
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  const jwtService: JwtPlugin = {
    signAccessToken({ sub }) {
      const opts: SignOptions = {
        algorithm: 'HS256',
        expiresIn: config.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
      }
      return jsonwebtoken.sign({ sub, type: 'access' }, config.JWT_ACCESS_SECRET, opts)
    },

    signRefreshToken({ sub, jti }) {
      const opts: SignOptions = {
        algorithm: 'HS256',
        expiresIn: config.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
      }
      return jsonwebtoken.sign({ sub, jti, type: 'refresh' }, config.JWT_REFRESH_SECRET, opts)
    },

    verifyAccessToken(token) {
      try {
        const decoded = jsonwebtoken.verify(token, config.JWT_ACCESS_SECRET, {
          algorithms: ['HS256'],
        }) as AccessTokenPayload

        if (decoded.type !== 'access') {
          throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid token type', 401)
        }

        return decoded
      } catch (err) {
        if (err instanceof AppError) throw err
        if (err instanceof jsonwebtoken.TokenExpiredError) {
          throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Access token has expired', 401)
        }
        throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid access token', 401)
      }
    },

    verifyRefreshToken(token) {
      try {
        const decoded = jsonwebtoken.verify(token, config.JWT_REFRESH_SECRET, {
          algorithms: ['HS256'],
        }) as RefreshTokenPayload

        if (decoded.type !== 'refresh') {
          throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid token type', 401)
        }

        return decoded
      } catch (err) {
        if (err instanceof AppError) throw err
        if (err instanceof jsonwebtoken.TokenExpiredError) {
          throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Refresh token has expired', 401)
        }
        throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid refresh token', 401)
      }
    },
  }

  fastify.decorate('jwt', jwtService)
}

export default fp(jwtPlugin, { name: 'jwt' })
