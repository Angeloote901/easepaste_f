import Redis from 'ioredis'
import { Worker } from 'bullmq'
import { DOCUMENT_QUEUE_NAME } from './queues/document.queue'
import { documentProcessor } from './processors/document.processor'
import { config } from './config'
import { logger } from '../logger'

async function startWorker() {
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null })

  const worker = new Worker(DOCUMENT_QUEUE_NAME, documentProcessor, {
    connection: redis,
    concurrency: 5,
  })

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed')
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed')
  })

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down')
    await worker.close()
    await redis.quit()
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

  logger.info('Document worker started')
}

startWorker().catch((err) => {
  logger.error({ err }, 'Failed to start worker')
  process.exit(1)
})
