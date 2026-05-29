import type { FastifyInstance } from 'fastify'
import { loadConfig, saveConfig, validateConfig } from '../core/config.js'
import { hashPassword } from '../core/auth.js'
import type { AppConfig } from '../../types.js'

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/api/config', async (_req, reply) => {
    const cfg = await loadConfig()
    const { password: _p, sessionSecret: _s, ...safe } = cfg
    reply.send({ ok: true, data: safe })
  })

  fastify.put('/api/config', async (request, reply) => {
    const updates = request.body as Partial<AppConfig>
    const current = await loadConfig()

    // A 'password' field arriving over the API is a plaintext password — bcrypt-hash it
    // before saving, exactly as the CLI's `config set password` does (H4). Without this,
    // plaintext lands in config.json and the bcrypt-compare login path can never match it,
    // locking the user out. sessionSecret is never accepted from the client.
    const { sessionSecret: _ignored, ...allowed } = updates
    if (typeof allowed.password === 'string' && allowed.password.length > 0) {
      allowed.password = await hashPassword(allowed.password)
    } else {
      delete allowed.password   // never overwrite an existing hash with '' or undefined
    }

    const updated = { ...current, ...allowed }
    const errors = validateConfig(updated)
    if (errors.length) return reply.code(400).send({ ok: false, error: { code: 'invalid_config', message: errors.join('; ') } })
    await saveConfig(updated)
    const { password: _p, sessionSecret: _s, ...safe } = updated
    reply.send({ ok: true, data: safe })
  })
}
