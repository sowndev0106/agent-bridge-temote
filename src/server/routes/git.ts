import type { FastifyInstance } from 'fastify'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, lstat } from 'fs/promises'
import { readJson } from '../core/persistence.js'
import { PROJECTS_FILE } from '../core/paths.js'
import { resolveProjectChildPath } from './project-files.js'
import type { Project, GitFileStatus } from '../../types.js'

const execFileAsync = promisify(execFile)

async function loadProjects(): Promise<Project[]> {
  return (await readJson<Project[]>(PROJECTS_FILE)) ?? []
}

async function findProject(projectId: string): Promise<Project | null> {
  const projects = await loadProjects()
  return projects.find(p => p.id === projectId) ?? null
}

async function getGitStatus(cwd: string): Promise<{ isGit: boolean; files: GitFileStatus[] }> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain', '-u'], { cwd })
    const lines = stdout.split('\n')
    const files: GitFileStatus[] = []
    for (const line of lines) {
      if (!line) continue
      const status = line.slice(0, 2)
      const path = line.slice(3).trim()
      files.push({ path, status: status.trim() })
    }
    return { isGit: true, files }
  } catch (e) {
    return { isGit: false, files: [] }
  }
}

async function getGitDiff(cwd: string, relativePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['show', `HEAD:${relativePath}`], { cwd })
    return stdout
  } catch (e) {
    return ''
  }
}

export async function gitRoutes(fastify: FastifyInstance) {
  fastify.get('/api/projects/:projectId/git/status', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const project = await findProject(projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    try {
      const result = await getGitStatus(project.path)
      return { ok: true, data: result }
    } catch (e) {
      return reply.code(500).send({ ok: false, error: { code: 'server_error', message: e instanceof Error ? e.message : 'Git status failed' } })
    }
  })

  fastify.get('/api/projects/:projectId/git/diff', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const { path } = request.query as { path?: string }
    if (!path) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"path" is required' } })

    const project = await findProject(projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    try {
      const resolved = await resolveProjectChildPath(project, path)
      const baseContent = await getGitDiff(project.path, resolved.relativePath)
      
      let currentContent = ''
      try {
        const stats = await lstat(resolved.absolutePath)
        if (stats.isFile()) {
          currentContent = await readFile(resolved.absolutePath, 'utf-8')
        }
      } catch (err) {
        // If file was deleted or unreadable
      }

      return {
        ok: true,
        data: {
          path: resolved.relativePath,
          baseContent,
          currentContent
        }
      }
    } catch (e) {
      return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: e instanceof Error ? e.message : 'Invalid path' } })
    }
  })
}
