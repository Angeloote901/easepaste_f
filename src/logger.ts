import pino from 'pino'
import { config } from './config'

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      'password_hash',
      'ssn',
      'ssn_encrypted',
      'tax_id',
      'tax_id_encrypted',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.ssn',
      'req.body.tax_id',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    req: (req) => ({
      requestId: req.id,
      method: req.method,
      url: req.url,
      // email deliberately excluded from req serializer to prevent PII in request logs
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
  ...(config.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
})
