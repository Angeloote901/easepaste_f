import fp from 'fastify-plugin'
import { Pool } from 'pg'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../../config'
import { logger } from '../../logger'

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 })

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle PostgreSQL client')
  })

  // Verify connectivity at startup
  const client = await pool.connect()
  client.release()

  fastify.decorate('db', pool)
  fastify.addHook('onClose', async () => {
    await pool.end()
  })
}

export default fp(dbPlugin, { name: 'db' })
