import fp from 'fastify-plugin'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { FastifyPluginAsync } from 'fastify'
import { config } from '../../config'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface S3Plugin {
  client: S3Client
  getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>
  getPresignedUploadUrl(key: string, expiresIn?: number): Promise<string>
}

// ─── Module augmentation ─────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    s3: S3Plugin
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

const s3Plugin: FastifyPluginAsync = async (fastify) => {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
  })

  const s3Service: S3Plugin = {
    client,

    async getPresignedDownloadUrl(key, expiresIn = 3600) {
      const command = new GetObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
      })
      return getSignedUrl(client, command, { expiresIn })
    },

    async getPresignedUploadUrl(key, expiresIn = 3600) {
      const command = new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
      })
      return getSignedUrl(client, command, { expiresIn })
    },
  }

  fastify.decorate('s3', s3Service)
  fastify.addHook('onClose', async () => {
    client.destroy()
  })
}

export default fp(s3Plugin, { name: 's3' })
