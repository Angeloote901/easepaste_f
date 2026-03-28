import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'
import { AppError, ErrorCode } from '../../shared/types/errors'

// ─── Module augmentation ─────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  const authHeader = request.headers['authorization']

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    done(new AppError(ErrorCode.UNAUTHORIZED, 'Missing or invalid Authorization header', 401))
    return
  }

  const token = authHeader.slice('Bearer '.length).trim()

  try {
    const payload = request.server.jwt.verifyAccessToken(token)
    request.user = { id: payload.sub }
    done()
  } catch (err) {
    if (err instanceof AppError) {
      done(err)
    } else {
      done(new AppError(ErrorCode.UNAUTHORIZED, 'Authentication failed', 401))
    }
  }
}
