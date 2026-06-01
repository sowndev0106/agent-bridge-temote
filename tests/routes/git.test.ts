import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { Project, AppConfig } from '../../types.js'
import { hashPassword, generateSecret } from '../../src/server/core/auth.js'
import { createServer } from '../../src/server/index.js'
import { CONFIG_DIR, CONFIG_FILE, PROJECTS_FILE } from '../../src/server/core/paths.js'
import { atomicWrite } from '../../src/server/core/persistence.js'

const execAsync = promisify(exec)

let root: string
let project: Project

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rb-git-root-'))
  await mkdir(join(root, 'src'), { recursive: true })
  
  // Initialize git repo for testing git status and diff endpoints
  try {
    await execAsync('git init', { cwd: root })
    await execAsync('git config user.email "test@example.com"', { cwd: root })
    await execAsync('git config user.name "Test User"', { cwd: root })
  } catch (e) {
    // git might not be installed, endpoints will handle gracefully
  }

  await writeFile(join(root, 'README.md'), '# RemoteBridge\n')
  
  try {
    await execAsync('git add README.md', { cwd: root })
    await execAsync('git commit -m "initial commit"', { cwd: root })
  } catch (e) {
    // fallback
  }

  // Now create a modified file and an untracked file
  await writeFile(join(root, 'README.md'), '# RemoteBridge - Edited\n')
  await writeFile(join(root, 'src', 'new-file.ts'), 'export const ok = true\n')

  project = {
    id: 'project-1',
    name: 'Example Git',
    path: root,
    env: {},
    lastAgentId: null,
    createdAt: '2026-05-29T00:00:00.000Z'
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('gitRoutes', () => {
  it('requires auth through the protected route group', async () => {
    const server = await createServer()
    await server.fastify.ready()
    const res = await server.fastify.inject({ method: 'GET', url: '/api/projects/project-1/git/status' })
    expect(res.statusCode).toBe(401)
    await server.fastify.close()
  })

  it('serves git status and diffs for authenticated users', async () => {
    const password = 'git-route-pass'
    const cfg: AppConfig = {
      port: 4099,
      host: '127.0.0.1',
      password: await hashPassword(password),
      sessionSecret: generateSecret(),
      sessionTTL: 3600,
      linkExtractTimeout: 10,
      maxConcurrentSessions: 10,
      keepSessionLogsLines: 500,
      agents: {},
      globalEnv: {},
      logLevel: 'error'
    }
    await mkdir(CONFIG_DIR, { recursive: true })
    await atomicWrite(CONFIG_FILE, cfg)
    await atomicWrite(PROJECTS_FILE, [project])

    const server = await createServer()
    await server.fastify.ready()
    
    // Login
    const login = await server.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password }
    })
    const cookies = login.cookies.map(c => `${c.name}=${c.value}`).join('; ')

    // GET Git Status
    const statusRes = await server.fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/git/status`,
      headers: { cookie: cookies }
    })
    expect(statusRes.statusCode).toBe(200)
    const statusData = statusRes.json().data
    if (statusData.isGit) {
      expect(statusData.files.length).toBeGreaterThan(0)
      expect(statusData.files.some((f: any) => f.path === 'README.md')).toBe(true)
    }

    // GET Git Diff of README.md
    const diffRes = await server.fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/git/diff?path=${encodeURIComponent('README.md')}`,
      headers: { cookie: cookies }
    })
    expect(diffRes.statusCode).toBe(200)
    const diffData = diffRes.json().data
    expect(diffData.path).toBe('README.md')
    expect(diffData.currentContent).toContain('# RemoteBridge - Edited')

    await server.fastify.close()
  })
})
