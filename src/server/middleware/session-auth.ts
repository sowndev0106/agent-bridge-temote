import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifySession } from '../core/auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    sessionPayload: Record<string, unknown> | null
  }
}

export function makeSessionAuthHook(secret: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const cookie = request.cookies?.['rb_session']
    if (!cookie) return reply.code(401).send({ ok: false, error: { code: 'auth_required', message: 'Authentication required' } })
    const payload = verifySession(cookie, secret)
    if (!payload) return reply.code(401).send({ ok: false, error: { code: 'auth_required', message: 'Session expired or invalid' } })
    request.sessionPayload = payload
  }
}
