import type { FastifyInstance } from 'fastify'
import type { SessionManager } from '../sessions/manager.js'
import { detectGitBranch } from '../sessions/branch.js'
import { resolveClaudeProviderSessionId } from '../sessions/claude-history.js'
import { loadConfig } from '../core/config.js'
import { readJson } from '../core/persistence.js'
import { PROJECTS_FILE } from '../core/paths.js'
import type { Project } from '../../types.js'

export async function sessionRoutes(fastify: FastifyInstance, manager: SessionManager) {
  fastify.get('/api/sessions', async () => {
    return { ok: true, data: manager.listSessions() }
  })

  fastify.post('/api/sessions/launch', async (request, reply) => {
    const { projectId, agentId, title } = request.body as { projectId?: string; agentId?: string; title?: string }
    if (!projectId || !agentId) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"projectId" and "agentId" are required' } })

    const config = await loadConfig()

    const runningSessions = manager.listSessions().filter(s => s.state === 'running' || s.state === 'launching')
    if (runningSessions.length >= config.maxConcurrentSessions) {
      return reply.code(429).send({ ok: false, error: { code: 'max_sessions_reached', message: `Maximum ${config.maxConcurrentSessions} concurrent sessions reached` } })
    }

    const projects = (await readJson<Project[]>(PROJECTS_FILE)) ?? []
    const project = projects.find(p => p.id === projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    const branch = await detectGitBranch(project.path)
    const session = manager.createSession({ projectId, agentId, title, branch })

    // Launch async — response returns immediately
    manager.launch(session.id, { project: { path: project.path, env: project.env }, config }).catch(err => {
      manager.updateSession(session.id, { state: 'failed', error: err.message, stoppedAt: new Date().toISOString() })
    })

    reply.code(201).send({ ok: true, data: session })
  })

  fastify.post('/api/sessions/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = manager.getSession(id)
    if (!session) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Session not found' } })
    manager.stop(id)
    reply.send({ ok: true, data: manager.getSession(id) })
  })

  fastify.post('/api/sessions/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = manager.getSession(id)
    if (!session) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Session not found' } })

    const projects = (await readJson<Project[]>(PROJECTS_FILE)) ?? []
    const project = projects.find(p => p.id === session.projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    const config = await loadConfig()

    // Enforce the concurrency cap on restart too — a restart re-enters 'launching', so a
    // stopped session restarting while others run could otherwise push past the cap. Count
    // OTHER live sessions (exclude this one, which is stopped/failed).
    const otherLive = manager.listSessions().filter(s => s.id !== id && (s.state === 'running' || s.state === 'launching'))
    if (otherLive.length >= config.maxConcurrentSessions) {
      return reply.code(429).send({ ok: false, error: { code: 'max_sessions_reached', message: `Maximum ${config.maxConcurrentSessions} concurrent sessions reached` } })
    }

    if (session.agentId === 'claude' && !session.providerSessionId) {
      const providerSessionId = await resolveClaudeProviderSessionId(project.path)
      if (providerSessionId) manager.updateSession(id, { providerSessionId })
    }

    manager.restart(id, { project: { path: project.path, env: project.env }, config }).catch(err => {
      manager.updateSession(id, { state: 'failed', error: err.message, stoppedAt: new Date().toISOString() })
    })
    reply.send({ ok: true, data: manager.getSession(id) })
  })

  fastify.post('/api/sessions/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { input } = request.body as { input: string }
    if (!input) {
      return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"input" is required' } })
    }

    const session = manager.getSession(id)
    if (!session) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Session not found' } })

    const adapter = (manager as any).getAdapter(session.agentId)
    if (typeof adapter.sendMessage !== 'function') {
      return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: `Agent ${session.agentId} does not support rich chat messages` } })
    }

    await adapter.sendMessage(id, input)
    reply.send({ ok: true, data: manager.getSession(id) })
  })

  fastify.post('/api/sessions/:id/interrupt', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = manager.getSession(id)
    if (!session) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Session not found' } })

    const adapter = (manager as any).getAdapter(session.agentId)
    if (session.agentId === 'codex' && session.activeTurn) {
      const state = (adapter as any).sessions.get(id)
      if (state) {
        await state.client.sendRequest('turn/interrupt', {
          threadId: session.providerSessionId,
          turnId: session.activeTurn.id
        })
        session.activeTurn.status = 'interrupted'
        manager.updateSession(id, { activeTurn: session.activeTurn })
      }
    }

    reply.send({ ok: true, data: manager.getSession(id) })
  })

  fastify.post('/api/sessions/:id/approvals/:approvalId', async (request, reply) => {
    const { id, approvalId } = request.params as { id: string; approvalId: string }
    const { decision } = request.body as { decision: 'approved' | 'rejected' }
    if (!decision) {
      return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"decision" is required' } })
    }

    const session = manager.getSession(id)
    if (!session) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Session not found' } })

    const adapter = (manager as any).getAdapter(session.agentId)
    if (typeof adapter.resolveApproval !== 'function') {
      return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: `Agent ${session.agentId} does not support approvals` } })
    }

    await adapter.resolveApproval(id, approvalId, decision)
    reply.send({ ok: true, data: manager.getSession(id) })
  })

  fastify.delete('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      manager.removeSession(id)
      reply.send({ ok: true, data: null })
    } catch (err: unknown) {
      reply.code(409).send({ ok: false, error: { code: 'session_active', message: (err as Error).message } })
    }
  })
}
