import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { stat } from 'fs/promises'
import { isAbsolute, join } from 'path'
import { homedir } from 'os'
import { readJson, atomicWrite } from '../core/persistence.js'
import type { SessionManager } from '../sessions/manager.js'
import type { Project } from '../../types.js'

const PROJECTS_FILE = join(homedir(), '.remotebridge', 'projects.json')

async function loadProjects(): Promise<Project[]> {
  return (await readJson<Project[]>(PROJECTS_FILE)) ?? []
}

async function saveProjects(projects: Project[]): Promise<void> {
  await atomicWrite(PROJECTS_FILE, projects)
}

async function validatePath(p: string): Promise<string | null> {
  if (!isAbsolute(p)) return '"path" must be an absolute path'
  try {
    const s = await stat(p)
    if (!s.isDirectory()) return '"path" must be a directory'
    return null
  } catch {
    return `"path" does not exist: ${p}`
  }
}

export async function projectRoutes(fastify: FastifyInstance, manager: SessionManager) {
  fastify.get('/api/projects', async () => {
    return { ok: true, data: await loadProjects() }
  })

  fastify.post('/api/projects', async (request, reply) => {
    const { name, path, env = {} } = request.body as { name?: string; path?: string; env?: Record<string, string> }
    if (!name?.trim()) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"name" is required' } })
    if (!path) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"path" is required' } })

    const pathError = await validatePath(path)
    if (pathError) return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: pathError } })

    const project: Project = { id: randomUUID(), name: name.trim(), path, env, lastAgentId: null, createdAt: new Date().toISOString() }
    const projects = await loadProjects()
    projects.push(project)
    await saveProjects(projects)
    reply.code(201).send({ ok: true, data: project })
  })

  fastify.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Partial<Pick<Project, 'name' | 'path' | 'env'>>
    const projects = await loadProjects()
    const idx = projects.findIndex(p => p.id === id)
    if (idx === -1) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    if (updates.path) {
      const pathError = await validatePath(updates.path)
      if (pathError) return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: pathError } })
    }

    Object.assign(projects[idx], updates)
    await saveProjects(projects)
    reply.send({ ok: true, data: projects[idx] })
  })

  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const projects = await loadProjects()
    if (!projects.some(p => p.id === id)) {
      return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })
    }

    // Block deletion while any session for this project is still live (H15). Symmetric with
    // SessionManager.removeSession()'s running-guard: an aggregate can't be deleted while a
    // child references it, so Restart never 404s against a vanished project.
    const live = manager.listSessions().filter(
      s => s.projectId === id && (s.state === 'launching' || s.state === 'running')
    )
    if (live.length > 0) {
      return reply.code(409).send({ ok: false, error: { code: 'project_in_use', message: `Cannot delete project: ${live.length} session(s) still launching/running. Stop them first.` } })
    }

    await saveProjects(projects.filter(p => p.id !== id))
    reply.send({ ok: true, data: null })
  })
}
