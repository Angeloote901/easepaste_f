import { Queue } from 'bullmq'
import type Redis from 'ioredis'

export const DOCUMENT_QUEUE_NAME = 'documents'

export interface DocumentJobData {
  documentId: string
  userId: string
  fileType: 'pdf' | 'docx'
  storageKey: string
}

export function createDocumentQueue(redis: Redis) {
  return new Queue<DocumentJobData>(DOCUMENT_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  })
}

export async function addDocumentJob(
  queue: Queue<DocumentJobData>,
  data: DocumentJobData,
) {
  return queue.add('process', data, {
    jobId: `doc-${data.documentId}`, // idempotent job ID
  })
}
