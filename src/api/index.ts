import { buildApp } from './app'
import { config } from '../config'
import { logger } from '../logger'

async function start() {
  const app = await buildApp()

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal')
    await app.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((err) => {
      logger.error({ err }, 'Error during SIGTERM shutdown')
      process.exit(1)
    })
  })

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((err) => {
      logger.error({ err }, 'Error during SIGINT shutdown')
      process.exit(1)
    })
  })

  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  logger.info({ port: config.PORT }, 'API server started')
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start API server')
  process.exit(1)
})
