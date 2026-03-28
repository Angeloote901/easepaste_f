import type { Job } from 'bullmq'
import type { DocumentJobData } from '../queues/document.queue'
import { logger } from '../../logger'

export async function documentProcessor(job: Job<DocumentJobData>) {
  const jobLogger = logger.child({ jobId: job.id, documentId: job.data.documentId })
  jobLogger.info('Document processing job received')

  // Sprint 1 stub: acknowledge receipt and log.
  // Sprint 3+ will implement: virus scan, parse, field detection.
  await job.updateProgress(10)

  jobLogger.info(
    { fileType: job.data.fileType },
    'Document job enqueued successfully - processing pipeline not yet implemented',
  )

  await job.updateProgress(100)

  return { processed: false, reason: 'pipeline_not_implemented' }
}
