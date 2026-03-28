import { z } from 'zod'

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
})

export type WorkerConfig = z.infer<typeof workerEnvSchema>

const parsed = workerEnvSchema.safeParse(process.env)
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables for worker:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = Object.freeze(parsed.data)
