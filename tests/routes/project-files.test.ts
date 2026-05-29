import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getProjectFilePreview,
  listProjectFiles,
  resolveProjectChildPath
} from '../../src/server/routes/project-files.js'
import type { Project } from '../../src/types.js'

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
