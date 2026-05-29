import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyCsrfToken } from '../core/csrf.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function makeCsrfCheckHook() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // CSRF only gates state-changing requests (H6). Safe/idempotent reads pass through —
    // the client never attaches X-CSRF-Token to GETs.
    if (SAFE_METHODS.has(request.method)) return
    const token = request.headers['x-csrf-token'] as string | undefined
    const storedHash = request.cookies?.['rb_csrf']
    if (!token || !storedHash || !verifyCsrfToken(token, storedHash)) {
      return reply.code(403).send({ ok: false, error: { code: 'csrf_missing', message: 'CSRF token missing or invalid' } })
    }
  }
}
