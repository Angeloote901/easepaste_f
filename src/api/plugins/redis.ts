import fp from 'fastify-plugin'
import Redis from 'ioredis'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../../config'
import { logger } from '../../logger'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true })

  redis.on('error', (err) => {
    logger.warn({ err }, 'Redis connection error')
  })

  await redis.connect()

  fastify.decorate('redis', redis)
  fastify.addHook('onClose', async () => {
    await redis.quit()
  })
}

export default fp(redisPlugin, { name: 'redis' })
