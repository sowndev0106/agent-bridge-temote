import type { FastifyInstance } from 'fastify'
import { verifyPassword, signSession } from '../core/auth.js'
import { generateCsrfToken } from '../core/csrf.js'
import { makeSessionAuthHook } from '../middleware/session-auth.js'
import { RateLimiter } from '../core/rate-limit.js'
import type { AppConfig } from '../../types.js'

const loginLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 })

export async function authRoutes(fastify: FastifyInstance, { config, sessionSecret }: { config: AppConfig; sessionSecret: string }) {
  fastify.post('/api/auth/login', async (request, reply) => {
    const ip = request.ip
    if (!loginLimiter.check(ip)) {
      return reply.code(429).send({ ok: false, error: { code: 'rate_limited', message: 'Too many login attempts. Try again in a minute.' } })
    }

    const { password } = request.body as { password?: string }
    if (!password) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: 'Password required' } })

    const valid = await verifyPassword(password, config.password)
    if (!valid) return reply.code(401).send({ ok: false, error: { code: 'invalid_password', message: 'Incorrect password' } })

    const sessionToken = signSession({ loggedIn: true }, sessionSecret, config.sessionTTL)
    const { token: csrfToken, hash: csrfHash } = generateCsrfToken()

    reply
      .setCookie('rb_session', sessionToken, { httpOnly: true, sameSite: 'strict', path: '/' })
      .setCookie('rb_csrf', csrfHash, { httpOnly: false, sameSite: 'strict', path: '/' })
      .send({ ok: true, data: { csrfToken } })
  })

  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply
      .clearCookie('rb_session')
      .clearCookie('rb_csrf')
      .send({ ok: true, data: null })
  })

  // Called on page load when a valid session cookie already exists.
  // Issues a fresh CSRF token so mutations work after a browser refresh.
  fastify.get('/api/auth/csrf', { preHandler: makeSessionAuthHook(sessionSecret) }, async (_request, reply) => {
    const { token: csrfToken, hash: csrfHash } = generateCsrfToken()
    reply
      .setCookie('rb_csrf', csrfHash, { httpOnly: false, sameSite: 'strict', path: '/' })
      .send({ ok: true, data: { csrfToken } })
  })
}
