import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

interface HealthResponse {
  status: 'ok' | 'degraded'
  db: 'ok' | 'error'
  redis: 'ok' | 'error'
  timestamp: string
}

export const registerHealthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/health', async (_request, reply) => {
    let dbStatus: 'ok' | 'error' = 'ok'
    let redisStatus: 'ok' | 'error' = 'ok'

    // Check database
    try {
      await fastify.db.query('SELECT 1')
    } catch {
      dbStatus = 'error'
    }

    // Check Redis
    try {
      const pong = await fastify.redis.ping()
      if (pong !== 'PONG') {
        redisStatus = 'error'
      }
    } catch {
      redisStatus = 'error'
    }

    const overall: 'ok' | 'degraded' =
      dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded'

    const body: HealthResponse = {
      status: overall,
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    }

    const statusCode = overall === 'ok' ? 200 : 503
    return reply.status(statusCode).send(body)
  })
}
