import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { authRoutes } from '../../src/server/routes/auth.js'
import { hashPassword, generateSecret } from '../../src/server/core/auth.js'
import type { AppConfig } from '../../src/types.js'

let fastify: ReturnType<typeof Fastify>
const secret = generateSecret()
let config: AppConfig

beforeAll(async () => {
  config = {
    port: 4096, host: '127.0.0.1', password: await hashPassword('test123'),
    sessionSecret: secret, sessionTTL: 3600, linkExtractTimeout: 30,
    maxConcurrentSessions: 10, keepSessionLogsLines: 500,
    agents: {}, globalEnv: {}, logLevel: 'error'
  }
  fastify = Fastify()
  await fastify.register(cookie)
  await fastify.register(authRoutes, { config, sessionSecret: secret })
  await fastify.ready()
})

afterAll(() => fastify.close())

describe('auth routes', () => {
  it('POST /api/auth/login with correct password sets cookies', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'test123' }, headers: { 'content-type': 'application/json' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('POST /api/auth/login with wrong password returns 401', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { password: 'wrong' }, headers: { 'content-type': 'application/json' }
    })
    expect(res.statusCode).toBe(401)
  })
})
