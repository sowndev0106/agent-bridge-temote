import type { FastifyInstance } from 'fastify'
import { lstat, readdir, readFile, realpath, open, writeFile } from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { readJson } from '../core/persistence.js'
import { PROJECTS_FILE } from '../core/paths.js'
import type { FileEntry, FileListResult, FilePreviewResult, Project } from '../../types.js'

const MAX_PREVIEW_BYTES = 128 * 1024

async function loadProjects(): Promise<Project[]> {
  return (await readJson<Project[]>(PROJECTS_FILE)) ?? []
}

async function findProject(projectId: string): Promise<Project | null> {
  const projects = await loadProjects()
  return projects.find(p => p.id === projectId) ?? null
}

function normalizeRelativePath(path: string | undefined): string {
  const raw = path?.trim() ?? ''
  if (raw.includes('\0')) throw new Error('Invalid path')
  if (raw === '' || raw === '.') return ''
  if (isAbsolute(raw)) throw new Error('Path must be relative to the project')
  return raw
}

function isInside(root: string, child: string): boolean {
  const rel = relative(root, child)
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

export async function resolveProjectChildPath(project: Project, requestedPath?: string) {
  const root = await realpath(project.path)
  const normalized = normalizeRelativePath(requestedPath)
  const absoluteCandidate = resolve(root, normalized)
  if (!isInside(root, absoluteCandidate)) throw new Error('Path escapes project root')

  const absolutePath = await realpath(absoluteCandidate)
  if (!isInside(root, absolutePath)) throw new Error('Path escapes project root')

  const relativePath = relative(root, absolutePath)
  return { root, absolutePath, relativePath }
}

function entryType(stats: Awaited<ReturnType<typeof lstat>>): FileEntry['type'] {
  if (stats.isDirectory()) return 'directory'
  if (stats.isSymbolicLink()) return 'symlink'
  return 'file'
}

function sortEntries(a: FileEntry, b: FileEntry): number {
  if (a.type === 'directory' && b.type !== 'directory') return -1
  if (a.type !== 'directory' && b.type === 'directory') return 1
  return a.name.localeCompare(b.name)
}

export async function listProjectFiles(project: Project, requestedPath?: string): Promise<FileListResult> {
  const resolved = await resolveProjectChildPath(project, requestedPath)
  const dirents = await readdir(resolved.absolutePath, { withFileTypes: true })

  const entryPromises = dirents
    .filter(dirent => !dirent.name.startsWith('.'))
    .map(async (dirent) => {
      const absoluteEntry = join(resolved.absolutePath, dirent.name)
      const stats = await lstat(absoluteEntry)
      const type = entryType(stats)
      return {
        name: dirent.name,
        path: relative(resolved.root, absoluteEntry),
        type,
        size: type === 'directory' ? null : stats.size,
        modifiedAt: stats.mtime.toISOString()
      }
    })
  const entries = await Promise.all(entryPromises)

  const parent = resolved.relativePath === '' ? null : relative(resolved.root, dirname(resolved.absolutePath))
  return {
    projectId: project.id,
    rootPath: resolved.root,
    path: resolved.relativePath,
    parent,
    entries: entries.sort(sortEntries)
  }
}

function looksBinary(buf: Buffer): boolean {
  if (buf.includes(0)) return true
  const sample = buf.subarray(0, Math.min(buf.length, 2048))
  let suspicious = 0
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1
  }
  return sample.length > 0 && suspicious / sample.length > 0.08
}

export async function getProjectFilePreview(project: Project, requestedPath: string): Promise<FilePreviewResult> {
  const resolved = await resolveProjectChildPath(project, requestedPath)
  const stats = await lstat(resolved.absolutePath)
  if (stats.isDirectory()) {
    return { projectId: project.id, path: resolved.relativePath, type: 'directory', content: null, truncated: false, size: null }
  }
  if (stats.isSymbolicLink()) {
    return { projectId: project.id, path: resolved.relativePath, type: 'unsupported', content: null, truncated: false, size: stats.size }
  }

  const bytesToRead = Math.min(stats.size, MAX_PREVIEW_BYTES + 1)
  const buf = Buffer.alloc(bytesToRead)
  if (bytesToRead > 0) {
    const fd = await open(resolved.absolutePath, 'r')
    try {
      await fd.read(buf, 0, bytesToRead, 0)
    } finally {
      await fd.close()
    }
  }
  const sample = buf
  if (looksBinary(sample)) {
    return { projectId: project.id, path: resolved.relativePath, type: 'binary', content: null, truncated: false, size: stats.size }
  }
  if (stats.size > MAX_PREVIEW_BYTES) {
    return {
      projectId: project.id,
      path: resolved.relativePath,
      type: 'text',
      content: sample.subarray(0, MAX_PREVIEW_BYTES).toString('utf-8'),
      truncated: true,
      size: stats.size
    }
  }
  return {
    projectId: project.id,
    path: resolved.relativePath,
    type: 'text',
    content: sample.toString('utf-8'),
    truncated: false,
    size: stats.size
  }
}

export async function projectFileRoutes(fastify: FastifyInstance) {
  fastify.get('/api/projects/:projectId/files', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const { path } = request.query as { path?: string }
    const project = await findProject(projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    try {
      return { ok: true, data: await listProjectFiles(project, path) }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Path not found' } })
      if (code === 'EACCES') return reply.code(403).send({ ok: false, error: { code: 'forbidden', message: 'Permission denied' } })
      return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: e instanceof Error ? e.message : 'Invalid path' } })
    }
  })

  fastify.get('/api/projects/:projectId/files/preview', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const { path } = request.query as { path?: string }
    if (!path) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"path" is required' } })

    const project = await findProject(projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    try {
      return { ok: true, data: await getProjectFilePreview(project, path) }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Path not found' } })
      if (code === 'EACCES') return reply.code(403).send({ ok: false, error: { code: 'forbidden', message: 'Permission denied' } })
      return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: e instanceof Error ? e.message : 'Invalid path' } })
    }
  })

  fastify.put('/api/projects/:projectId/files', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const { path } = request.query as { path?: string }
    if (!path) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"path" is required' } })

    const { content } = request.body as { content: string }
    if (typeof content !== 'string') return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"content" must be a string' } })

    const project = await findProject(projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    try {
      const resolved = await resolveProjectChildPath(project, path)
      const stats = await lstat(resolved.absolutePath).catch(() => null)
      if (stats && stats.isDirectory()) {
        return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: 'Cannot write to a directory' } })
      }
      await writeFile(resolved.absolutePath, content, 'utf-8')
      return { ok: true, data: { success: true } }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Path not found' } })
      if (code === 'EACCES') return reply.code(403).send({ ok: false, error: { code: 'forbidden', message: 'Permission denied' } })
      return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: e instanceof Error ? e.message : 'Invalid path' } })
    }
  })
}
