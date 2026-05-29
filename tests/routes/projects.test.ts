import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { projectRoutes } from '../../src/server/routes/projects.js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

let tmpDir: string
let fastify: ReturnType<typeof Fastify>
let realProjectPath: string

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'rb-routes-'))
  realProjectPath = tmpDir  // use the tmpDir itself as a valid project path
  fastify = Fastify()
  // projectRoutes needs a SessionManager for the delete-in-use guard (H15).
  // These tests never exercise delete-with-live-sessions, so a no-session stub suffices.
  const managerStub = { listSessions: () => [] } as unknown as import('../../src/server/sessions/manager.js').SessionManager
  await fastify.register((a) => projectRoutes(a, managerStub))
  await fastify.ready()
})

afterAll(async () => {
  await fastify.close()
  await rm(tmpDir, { recursive: true })
})

describe('project routes', () => {
  it('GET /api/projects returns a list', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/projects' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toBeInstanceOf(Array)
  })

  it('POST /api/projects creates project with valid path', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/api/projects',
      payload: { name: 'Test', path: realProjectPath },
      headers: { 'content-type': 'application/json' }
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().data.name).toBe('Test')
  })

  it('POST /api/projects rejects non-existent path', async () => {
    const res = await fastify.inject({
      method: 'POST', url: '/api/projects',
      payload: { name: 'Bad', path: '/nonexistent/path/xyz' },
      headers: { 'content-type': 'application/json' }
    })
    expect(res.statusCode).toBe(400)
  })
})
