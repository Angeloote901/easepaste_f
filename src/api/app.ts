import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import { logger } from '../logger'
import { config } from '../config'
import dbPlugin from './plugins/db'
import redisPlugin from './plugins/redis'
import jwtPlugin from './plugins/jwt'
import s3Plugin from './plugins/s3'
import { requestIdHook } from './middleware/requestId'
import { registerAuthRoutes } from './modules/auth/auth.routes'
import { registerHealthRoutes } from './health/health.routes'
import { AppError } from '../shared/types/errors'

export async function buildApp() {
  const app = Fastify({
    logger,
    genReqId: () => crypto.randomUUID(),
  })

  // Security headers
  await app.register(helmet)

  // CORS
  await app.register(cors, {
    origin: config.NODE_ENV === 'production' ? false : true,
    credentials: true,
  })

  // Cookie support
  await app.register(cookie)

  // Request ID middleware
  app.addHook('onRequest', requestIdHook)

  // Infrastructure plugins
  await app.register(dbPlugin)
  await app.register(redisPlugin)
  await app.register(jwtPlugin)
  await app.register(s3Plugin)

  // Routes
  await app.register(registerHealthRoutes)
  await app.register(registerAuthRoutes, { prefix: '/api/auth' })

  // Global error handler — convert AppError and Fastify validation errors to consistent JSON
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      })
    }

    // Fastify validation error (JSON Schema)
    if (error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message },
      })
    }

    app.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
  })

  return app
}
