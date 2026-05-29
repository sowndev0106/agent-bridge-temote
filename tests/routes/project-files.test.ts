import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getProjectFilePreview,
  listProjectFiles,
  resolveProjectChildPath
} from '../../src/server/routes/project-files.js'
import type { Project, AppConfig, FileEntry } from '../../types.js'
import { hashPassword, generateSecret } from '../../src/server/core/auth.js'
import { createServer } from '../../src/server/index.js'
import { CONFIG_DIR, CONFIG_FILE, PROJECTS_FILE } from '../../src/server/core/paths.js'
import { atomicWrite } from '../../src/server/core/persistence.js'

let root: string
let outside: string
let project: Project

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rb-files-root-'))
  outside = await mkdtemp(join(tmpdir(), 'rb-files-outside-'))
  await mkdir(join(root, 'src'))
  await mkdir(join(root, '.git'))
  await writeFile(join(root, 'README.md'), '# RemoteBridge\n')
  await writeFile(join(root, 'src', 'index.ts'), 'export const ok = true\n')
  await writeFile(join(root, 'image.bin'), Buffer.from([0, 1, 2, 3]))
  await writeFile(join(outside, 'secret.txt'), 'secret')
  await symlink(join(outside, 'secret.txt'), join(root, 'secret-link')).catch(() => {})
  project = {
    id: 'project-1',
    name: 'Example',
    path: root,
    env: {},
    lastAgentId: null,
    createdAt: '2026-05-29T00:00:00.000Z'
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('resolveProjectChildPath', () => {
  it('resolves the project root for an empty path', async () => {
    const resolved = await resolveProjectChildPath(project, '')
    expect(resolved.relativePath).toBe('')
    expect(resolved.absolutePath).toBe(root)
  })

  it('rejects traversal outside the project root', async () => {
    await expect(resolveProjectChildPath(project, '../secret.txt')).rejects.toThrow('Path escapes project root')
  })

  it('rejects null bytes', async () => {
    await expect(resolveProjectChildPath(project, 'src\0index.ts')).rejects.toThrow('Invalid path')
  })
})

describe('listProjectFiles', () => {
  it('returns directories first, then files, and hides dot directories', async () => {
    const result = await listProjectFiles(project, '')
    expect(result.projectId).toBe('project-1')
    expect(result.path).toBe('')
    expect(result.parent).toBeNull()
    const expected = [
      'directory:src',
      'file:image.bin',
      'file:README.md'
    ]
    if (result.entries.some(e => e.name === 'secret-link')) {
      expected.push('symlink:secret-link')
    }
    expect(result.entries.map(e => `${e.type}:${e.name}`)).toEqual(expected)
  })

  it('returns parent path for nested directories', async () => {
    const result = await listProjectFiles(project, 'src')
    expect(result.path).toBe('src')
    expect(result.parent).toBe('')
    expect(result.entries.map(e => e.name)).toEqual(['index.ts'])
  })
})

describe('getProjectFilePreview', () => {
  it('returns text content for small UTF-8 files', async () => {
    const preview = await getProjectFilePreview(project, 'README.md')
    expect(preview.type).toBe('text')
    expect(preview.content).toContain('# RemoteBridge')
    expect(preview.truncated).toBe(false)
  })

  it('marks binary files without returning content', async () => {
    const preview = await getProjectFilePreview(project, 'image.bin')
    expect(preview.type).toBe('binary')
    expect(preview.content).toBeNull()
  })

  it('marks directories without returning content', async () => {
    const preview = await getProjectFilePreview(project, 'src')
    expect(preview.type).toBe('directory')
    expect(preview.content).toBeNull()
  })
})

describe('projectFileRoutes', () => {
  it('requires auth through the protected route group', async () => {
    const server = await createServer()
    await server.fastify.ready()
    const res = await server.fastify.inject({ method: 'GET', url: '/api/projects/project-1/files' })
    expect(res.statusCode).toBe(401)
    await server.fastify.close()
  })

  it('serves listings, previews, and updates for authenticated users', async () => {
    const password = 'file-route-pass'
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
    const csrfToken = login.json().data.csrfToken

    // GET files listing
    const list = await server.fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/files`,
      headers: { cookie: cookies }
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().data.entries.some((e: FileEntry) => e.name === 'README.md')).toBe(true)

    // GET file preview
    const preview = await server.fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/files/preview?path=${encodeURIComponent('README.md')}`,
      headers: { cookie: cookies }
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().data.content).toContain('# RemoteBridge')

    // PUT file edit (write)
    const edit = await server.fastify.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/files?path=${encodeURIComponent('README.md')}`,
      headers: { cookie: cookies, 'x-csrf-token': csrfToken },
      payload: { content: '# RemoteBridge - Edited\n' }
    })
    expect(edit.statusCode).toBe(200)
    expect(edit.json().ok).toBe(true)

    // Re-verify preview content is updated
    const previewAfter = await server.fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/files/preview?path=${encodeURIComponent('README.md')}`,
      headers: { cookie: cookies }
    })
    expect(previewAfter.json().data.content).toContain('# RemoteBridge - Edited')

    // Path confinement escape attempt via API
    const badReq = await server.fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/files?path=${encodeURIComponent('../secret.txt')}`,
      headers: { cookie: cookies }
    })
    expect(badReq.statusCode).toBe(400)
    expect(badReq.json().error.code).toBe('invalid_path')

    await server.fastify.close()
  })
})
