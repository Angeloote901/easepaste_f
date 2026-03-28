import { randomUUID } from 'crypto'
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'

export function requestIdHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  const incomingId = request.headers['x-request-id']
  const requestId =
    typeof incomingId === 'string' && incomingId.length > 0 ? incomingId : randomUUID()

  // Fastify exposes request.id — override it with our determined value
  // by casting since the property is normally read-only after initialisation
  ;(request as FastifyRequest & { id: string }).id = requestId

  void reply.header('x-request-id', requestId)
  done()
}
