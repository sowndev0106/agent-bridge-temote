import type { FastifyInstance } from 'fastify'
import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, parse, resolve } from 'path'

export interface BrowseResult {
  path: string
  parent: string | null
  entries: { name: string; path: string }[]
}

export async function listDirectories(input: string): Promise<BrowseResult> {
  if (input.includes('\0')) throw new Error('Invalid path')
  const path = resolve(input)
  const dirents = await readdir(path, { withFileTypes: true })
  const entries = dirents
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => ({ name: d.name, path: join(path, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const parent = parse(path).root === path ? null : dirname(path)
  return { path, parent, entries }
}

// Envelope matches src/server/routes/projects.ts: { ok: true, data } on success,
// reply.code(N).send({ ok: false, error: { code, message } }) on failure.
export async function fsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/fs/browse', async (request, reply) => {
    const { path } = request.query as { path?: string }
    try {
      return { ok: true, data: await listDirectories(path && path.length ? path : homedir()) }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Directory not found' } })
      if (code === 'EACCES') return reply.code(403).send({ ok: false, error: { code: 'forbidden', message: 'Permission denied' } })
      return reply.code(400).send({ ok: false, error: { code: 'bad_path', message: e instanceof Error ? e.message : 'Invalid path' } })
    }
  })
}
