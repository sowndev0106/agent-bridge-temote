import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import staticPlugin from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { loadConfig, validateConfig, CONFIG_DIR } from './core/config.js'
import { createLogger } from './core/logger.js'
import { makeSessionAuthHook } from './middleware/session-auth.js'
import { makeCsrfCheckHook } from './middleware/csrf-check.js'
import { authRoutes } from './routes/auth.js'
import { configRoutes } from './routes/config.js'
import { projectRoutes } from './routes/projects.js'
import { agentRoutes } from './routes/agents.js'
import { sessionRoutes } from './routes/sessions.js'
import { createWsServer } from './ws/index.js'
import { SessionManager } from './sessions/manager.js'
import type { WsEvent } from '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function createServer() {
  const config = await loadConfig()

  // Validate before starting
  const errors = validateConfig(config)
  if (errors.length) {
    errors.forEach(e => console.error('\x1b[31m✗\x1b[0m ' + e))
    process.exit(1)
  }

  if (config.host !== '127.0.0.1') {
    console.log('\x1b[33m⚠  RemoteBridge is bound to 0.0.0.0 — accessible from the network. Ensure firewall is configured.\x1b[0m')
  }

  const logger = createLogger(config.logLevel)
  const fastify = Fastify({ logger })

  await fastify.register(cookie)

  // Serve static SPA (production). Skipped in dev when dist/web doesn't exist yet.
  const webDist = join(__dirname, '../web')
  if (existsSync(join(webDist, 'index.html'))) {
    await fastify.register(staticPlugin, { root: webDist, prefix: '/', index: 'index.html' })
  }

  const sessionSecret = config.sessionSecret
  const requireSession = makeSessionAuthHook(sessionSecret)
  const requireCsrf = makeCsrfCheckHook()

  // WS server first so `broadcast` exists before the manager emits any event.
  const { broadcast } = createWsServer(fastify.server, sessionSecret)

  const manager = new SessionManager({
    keepSessionLogsLines: config.keepSessionLogsLines,
    linkExtractTimeout: config.linkExtractTimeout,
    maxConcurrentSessions: config.maxConcurrentSessions,
    sessionsFile: join(CONFIG_DIR, 'sessions.json'),
    onEvent: (event) => broadcast(event as WsEvent)
  })
  await manager.loadAndRecover()

  // Graceful shutdown — kill all spawned agents before exiting so none are orphaned
  // (FR3 / ADR-0002). PM2 sends SIGINT on stop/restart (--kill-timeout 6000 set at install).
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, async () => {
      await manager.killAll()            // SIGTERM all agents, brief bounded wait, SIGKILL stragglers
      await manager.flush()              // ensure final session state (stopped) reached disk
      await fastify.close().catch(() => {})
      process.exit(0)
    })
  }

  // Public routes
  fastify.get('/healthz', async () => ({ ok: true, data: { status: 'healthy' } }))
  await fastify.register(authRoutes, { config, sessionSecret })

  // Protected routes — session required on all; CSRF required on mutations (the CSRF
  // hook skips GET/HEAD/OPTIONS, so reads pass through). This covers project & config
  // mutations (POST/PUT/DELETE), which the API spec gates with session + CSRF.
  await fastify.register(async (app) => {
    app.addHook('preHandler', requireSession)
    app.addHook('preHandler', requireCsrf)
    await app.register((a) => projectRoutes(a, manager))  // manager needed for the delete-in-use guard (H15)
    await app.register(agentRoutes)
    await app.register(configRoutes)
    await app.register((a) => sessionRoutes(a, manager))
  })

  fastify.setNotFoundHandler(async (_req, reply) => {
    // SPA fallback
    if (existsSync(join(webDist, 'index.html'))) {
      return reply.sendFile('index.html')
    }
    reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Not found' } })
  })

  return { fastify, config, manager }
}

// Start if run directly
const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isMain) {
  const { fastify, config } = await createServer()
  await fastify.listen({ port: config.port, host: config.host })
  console.log(`RemoteBridge running on http://localhost:${config.port}`)
}
