# File Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished, read-only file explorer to each project workspace, with secure server-side project-root confinement, text-file preview, smooth responsive UI, and E2E coverage.

**Architecture:** Keep the existing `/api/fs/browse` route for the "Open project" modal. Add project-scoped file APIs under `/api/projects/:projectId/files` so the browser can only explore paths inside a saved project. The React workspace gets a compact command-center explorer panel with local component state, matching existing design tokens and avoiding new persistence.

**Tech Stack:** TypeScript / Fastify / React 18 / Vite / TailwindCSS token utilities / Zustand project/session stores / Lucide React / Vitest / Playwright.

---

## Scope

Build only read-only browsing and preview:

- Directory listing for files and folders inside a registered project.
- Breadcrumb navigation and folder drill-down.
- Text-file preview up to 128 KiB with truncation notice.
- Binary/oversized/unreadable file states.
- "Open shell here" action for directories using the existing terminal WebSocket event.
- Route tests for path confinement and preview behavior.
- Browser E2E for desktop/mobile layout, interactions, and no horizontal overflow.

Do not add file editing, file deletion, upload, rename, drag/drop, external provider work, or new agent logic in this plan.

## File Structure

- Modify: `src/types.ts`
  Add shared `FileEntry`, `FileListResult`, and `FilePreviewResult` types.
- Create: `src/server/routes/project-files.ts`
  Project-scoped file listing and text preview helpers plus Fastify routes.
- Modify: `src/server/index.ts`
  Register `projectFileRoutes` inside the existing authenticated route group.
- Modify: `src/web/lib/api.ts`
  Add `listProjectFiles()` and `getProjectFilePreview()` methods.
- Create: `src/web/components/FileExplorerPanel.tsx`
  Main workspace explorer shell, loading/error states, responsive layout, and action wiring.
- Create: `src/web/components/FilePreview.tsx`
  Preview pane for selected file/folder states.
- Modify: `src/web/pages/ProjectWorkspace.tsx`
  Insert the explorer between the project header and sessions list.
- Create: `tests/routes/project-files.test.ts`
  Pure helper and route-level coverage for filesystem boundaries and file preview.
- Create: `tests/e2e/file-explorer.spec.ts`
  Playwright browser E2E with mocked RemoteBridge API responses.

---

### Task 1: Shared File Explorer Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add failing type usage in the future route test**

Create `tests/routes/project-files.test.ts` with the first compile-time import only:

```ts
import { describe, expect, it } from 'vitest'
import type { FileEntry, FileListResult, FilePreviewResult } from '../../src/types'

describe('project file explorer types', () => {
  it('describes directory listings and previews', () => {
    const entry: FileEntry = {
      name: 'src',
      path: 'src',
      type: 'directory',
      size: null,
      modifiedAt: '2026-05-29T00:00:00.000Z'
    }
    const list: FileListResult = {
      projectId: 'project-1',
      rootPath: '/workspace/app',
      path: '',
      parent: null,
      entries: [entry]
    }
    const preview: FilePreviewResult = {
      projectId: 'project-1',
      path: 'README.md',
      type: 'text',
      content: '# RemoteBridge',
      truncated: false,
      size: 14
    }

    expect(list.entries[0].type).toBe('directory')
    expect(preview.type).toBe('text')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/routes/project-files.test.ts
```

Expected: FAIL because `FileEntry`, `FileListResult`, and `FilePreviewResult` are not exported.

- [ ] **Step 3: Add shared types**

Append these definitions to `src/types.ts` after `AppConfig` and before terminal types:

```ts
export type FileEntryType = 'directory' | 'file' | 'symlink'

export interface FileEntry {
  name: string
  path: string
  type: FileEntryType
  size: number | null
  modifiedAt: string
}

export interface FileListResult {
  projectId: string
  rootPath: string
  path: string
  parent: string | null
  entries: FileEntry[]
}

export type FilePreviewResult =
  | {
      projectId: string
      path: string
      type: 'text'
      content: string
      truncated: boolean
      size: number
    }
  | {
      projectId: string
      path: string
      type: 'binary' | 'directory' | 'too_large' | 'unsupported'
      content: null
      truncated: false
      size: number | null
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/routes/project-files.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/routes/project-files.test.ts
git commit -m "feat: add file explorer shared types"
```

---

### Task 2: Secure Project File Route Helpers

**Files:**
- Create: `src/server/routes/project-files.ts`
- Modify: `tests/routes/project-files.test.ts`

- [ ] **Step 1: Replace route test with helper coverage**

Replace `tests/routes/project-files.test.ts` with:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getProjectFilePreview,
  listProjectFiles,
  resolveProjectChildPath
} from '../../src/server/routes/project-files'
import type { Project } from '../../src/types'

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
    expect(result.entries.map(e => `${e.type}:${e.name}`)).toEqual([
      'directory:src',
      'file:image.bin',
      'file:README.md'
    ])
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/routes/project-files.test.ts
```

Expected: FAIL because `src/server/routes/project-files.ts` does not exist.

- [ ] **Step 3: Create helper implementation**

Create `src/server/routes/project-files.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { lstat, readdir, readFile, realpath } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
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
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
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
  const entries: FileEntry[] = []

  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) continue
    const absoluteEntry = join(resolved.absolutePath, dirent.name)
    const stats = await lstat(absoluteEntry)
    const type = entryType(stats)
    entries.push({
      name: dirent.name,
      path: relative(resolved.root, absoluteEntry),
      type,
      size: type === 'directory' ? null : stats.size,
      modifiedAt: stats.mtime.toISOString()
    })
  }

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
  const buf = await readFile(resolved.absolutePath)
  const sample = buf.subarray(0, bytesToRead)
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
      return reply.code(400).send({ ok: false, error: { code: 'bad_path', message: e instanceof Error ? e.message : 'Invalid path' } })
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
      return reply.code(400).send({ ok: false, error: { code: 'bad_path', message: e instanceof Error ? e.message : 'Invalid path' } })
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/routes/project-files.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/project-files.ts tests/routes/project-files.test.ts
git commit -m "feat: add secure project file helpers"
```

---

### Task 3: Project File API Routes

**Files:**
- Modify: `src/server/index.ts`
- Modify: `tests/routes/project-files.test.ts`

- [ ] **Step 1: Add authenticated route coverage**

Append these imports to `tests/routes/project-files.test.ts`:

```ts
import { hashPassword, generateSecret } from '../../src/server/core/auth'
import { createServer } from '../../src/server/index'
import { CONFIG_DIR, CONFIG_FILE, PROJECTS_FILE } from '../../src/server/core/paths'
import { atomicWrite } from '../../src/server/core/persistence'
import type { AppConfig } from '../../src/types'
```

Append this test block:

```ts
describe('projectFileRoutes', () => {
  it('requires auth through the protected route group', async () => {
    const server = await createServer()
    await server.fastify.ready()
    const res = await server.fastify.inject({ method: 'GET', url: '/api/projects/project-1/files' })
    expect(res.statusCode).toBe(401)
    await server.fastify.close()
  })

  it('serves listings and previews for authenticated users', async () => {
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
    const login = await server.fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password }
    })
    const cookies = login.cookies.map(c => `${c.name}=${c.value}`).join('; ')

    const list = await server.fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/files`,
      headers: { cookie: cookies }
    })
    expect(list.statusCode).toBe(200)
    expect(list.json().data.entries.some((e: FileEntry) => e.name === 'README.md')).toBe(true)

    const preview = await server.fastify.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/files/preview?path=${encodeURIComponent('README.md')}`,
      headers: { cookie: cookies }
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().data.content).toContain('# RemoteBridge')

    await server.fastify.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/routes/project-files.test.ts
```

Expected: FAIL because routes are not registered in `createServer()`.

- [ ] **Step 3: Register project file routes**

Modify `src/server/index.ts`.

Add import:

```ts
import { projectFileRoutes } from './routes/project-files.js'
```

Register after `projectRoutes` and before `fsRoutes` inside the protected route group:

```ts
await app.register((a) => projectRoutes(a, manager))
await app.register(projectFileRoutes)
await app.register(fsRoutes)
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/routes/project-files.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts tests/routes/project-files.test.ts
git commit -m "feat: expose authenticated project file routes"
```

---

### Task 4: Frontend API Client

**Files:**
- Modify: `src/web/lib/api.ts`
- Create: `tests/web/file-api.test.ts`

- [ ] **Step 1: Add API client test**

Create `tests/web/file-api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/web/lib/api'

const ok = (data: unknown) => ({ ok: true, data })

describe('file explorer api client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('encodes project file paths for list and preview calls', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify(ok({
        projectId: 'project-1',
        rootPath: '/workspace/app',
        path: 'src/components',
        parent: 'src',
        entries: []
      })), { headers: { 'content-type': 'application/json' } })
    }))

    await api.listProjectFiles('project-1', 'src/components')
    await api.getProjectFilePreview('project-1', 'src/App.tsx')

    expect(calls).toEqual([
      '/api/projects/project-1/files?path=src%2Fcomponents',
      '/api/projects/project-1/files/preview?path=src%2FApp.tsx'
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/web/file-api.test.ts
```

Expected: FAIL because the new API methods do not exist.

- [ ] **Step 3: Add API methods**

Update the import in `src/web/lib/api.ts`:

```ts
import type { Project, AgentDefinition, Session, AppConfig, FileListResult, FilePreviewResult } from '../../types'
```

Add these methods to the exported `api` object after `browseFolder`:

```ts
  listProjectFiles: (projectId: string, path?: string) =>
    request<FileListResult>(
      'GET',
      `/api/projects/${projectId}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`
    ),
  getProjectFilePreview: (projectId: string, path: string) =>
    request<FilePreviewResult>(
      'GET',
      `/api/projects/${projectId}/files/preview?path=${encodeURIComponent(path)}`
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/web/file-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/api.ts tests/web/file-api.test.ts
git commit -m "feat: add file explorer api client"
```

---

### Task 5: File Preview Component

**Files:**
- Create: `src/web/components/FilePreview.tsx`

- [ ] **Step 1: Create the preview component**

Create `src/web/components/FilePreview.tsx`:

```tsx
import { Binary, FileCode2, FolderOpen, Loader2 } from 'lucide-react'
import type { FileEntry, FilePreviewResult } from '../../types'

function formatSize(size: number | null): string {
  if (size === null) return 'folder'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export default function FilePreview({
  selected,
  preview,
  loading,
  error
}: {
  selected: FileEntry | null
  preview: FilePreviewResult | null
  loading: boolean
  error: string | null
}) {
  if (!selected) {
    return (
      <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 text-center">
        <FolderOpen size={28} className="text-[var(--color-text-muted)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">Select a file</p>
        <p className="max-w-[280px] text-xs leading-relaxed text-[var(--color-text-muted)]">
          Browse the project tree and preview source files without leaving the workspace.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[240px] flex-1 flex-col overflow-hidden">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{selected.name}</p>
          <p className="rb-mono truncate text-[11px] text-[var(--color-text-muted)]">{selected.path}</p>
        </div>
        <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{formatSize(selected.size)}</span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading preview
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-[var(--color-failed)]">{error}</div>
      ) : preview?.type === 'text' ? (
        <div className="rb-scrollbar flex-1 overflow-auto bg-[var(--color-bg-base)] p-4">
          {preview.truncated && (
            <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              Preview truncated at 128 KiB.
            </div>
          )}
          <pre className="rb-mono whitespace-pre-wrap break-words text-[12px] leading-6 text-[var(--color-text-code)]">{preview.content}</pre>
        </div>
      ) : preview?.type === 'directory' ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
          <FolderOpen size={15} /> Open the folder to inspect its contents.
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
          {preview?.type === 'binary' ? <Binary size={15} /> : <FileCode2 size={15} />}
          Preview is not available for this file.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/FilePreview.tsx
git commit -m "feat: add file preview component"
```

---

### Task 6: File Explorer Panel UI

**Files:**
- Create: `src/web/components/FileExplorerPanel.tsx`

- [ ] **Step 1: Create the explorer panel**

Create `src/web/components/FileExplorerPanel.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, FileText, RefreshCw, TerminalSquare } from 'lucide-react'
import { api } from '../lib/api'
import { sendWsMessage } from '../lib/ws'
import FilePreview from './FilePreview'
import type { FileEntry, FileListResult, FilePreviewResult, Project } from '../../types'

function joinDisplayPath(root: string, rel: string): string {
  return rel ? `${root.replace(/\/+$/, '')}/${rel}` : root
}

function fileIcon(entry: FileEntry, active: boolean) {
  const cls = active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
  if (entry.type === 'directory') return active ? <FolderOpen size={16} className={cls} /> : <Folder size={16} className={cls} />
  return <FileText size={16} className={cls} />
}

export default function FileExplorerPanel({ project }: { project: Project }) {
  const [listing, setListing] = useState<FileListResult | null>(null)
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [preview, setPreview] = useState<FilePreviewResult | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const loadPath = async (path = '') => {
    setLoadingList(true)
    setError(null)
    try {
      const res = await api.listProjectFiles(project.id, path)
      setListing(res)
      setSelected(null)
      setPreview(null)
      setPreviewError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot read folder')
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    loadPath('')
  }, [project.id])

  const breadcrumbs = useMemo(() => {
    const parts = listing?.path ? listing.path.split(/[\\/]+/).filter(Boolean) : []
    const crumbs = [{ label: project.name, path: '' }]
    let current = ''
    for (const part of parts) {
      current = current ? `${current}/${part}` : part
      crumbs.push({ label: part, path: current })
    }
    return crumbs
  }, [listing?.path, project.name])

  const selectEntry = async (entry: FileEntry) => {
    setSelected(entry)
    setPreview(null)
    setPreviewError(null)
    if (entry.type === 'directory') return
    setLoadingPreview(true)
    try {
      setPreview(await api.getProjectFilePreview(project.id, entry.path))
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Cannot preview file')
    } finally {
      setLoadingPreview(false)
    }
  }

  const openShellHere = () => {
    const cwd = listing ? joinDisplayPath(listing.rootPath, listing.path) : project.path
    sendWsMessage({ type: 'terminal.create', payload: { cwd, projectId: project.id } })
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/55 shadow-[var(--shadow-card)]" aria-label="File explorer">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Files</h2>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-[var(--color-text-muted)]">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.path || 'root'} className="flex min-w-0 items-center gap-1">
                {index > 0 && <ChevronRight size={12} className="shrink-0" />}
                <button type="button" onClick={() => loadPath(crumb.path)} className="max-w-[160px] truncate hover:text-[var(--color-text-primary)]">
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => loadPath(listing?.path ?? '')} className="rb-icon-button h-8 min-h-8 w-8 min-w-8" aria-label="Refresh files" title="Refresh files">
            <RefreshCw size={14} />
          </button>
          <button type="button" onClick={openShellHere} className="rb-ghost-button px-3" title="Open a shell in this folder">
            <TerminalSquare size={14} /> Shell here
          </button>
        </div>
      </div>

      <div className="grid min-h-[320px] grid-cols-1 md:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
        <div className="border-b border-[var(--color-border-subtle)] md:border-b-0 md:border-r">
          <div className="rb-scrollbar max-h-[340px] overflow-y-auto p-2 md:max-h-[440px]">
            {listing?.parent !== null && listing && (
              <button type="button" onClick={() => loadPath(listing.parent ?? '')} className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
                <FolderOpen size={16} className="text-[var(--color-text-muted)]" /> ..
              </button>
            )}
            {loadingList && !listing ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--color-text-muted)]">Loading files</p>
            ) : error ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--color-failed)]">{error}</p>
            ) : listing?.entries.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--color-text-muted)]">This folder is empty</p>
            ) : (
              listing?.entries.map(entry => {
                const active = selected?.path === entry.path
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onDoubleClick={() => entry.type === 'directory' && loadPath(entry.path)}
                    onClick={() => entry.type === 'directory' ? loadPath(entry.path) : selectEntry(entry)}
                    className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors ${active ? 'bg-[var(--color-accent-glow)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}
                  >
                    {fileIcon(entry, active)}
                    <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
                    {entry.type !== 'directory' && <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{entry.size} B</span>}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <FilePreview selected={selected} preview={preview} loading={loadingPreview} error={previewError} />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/FileExplorerPanel.tsx
git commit -m "feat: add file explorer panel"
```

---

### Task 7: Integrate Explorer Into Project Workspace

**Files:**
- Modify: `src/web/pages/ProjectWorkspace.tsx`

- [ ] **Step 1: Import the panel**

Add:

```ts
import FileExplorerPanel from '../components/FileExplorerPanel'
```

- [ ] **Step 2: Render the panel after the project header**

In `ProjectWorkspace`, render the explorer immediately after the closing `</header>` and before the sessions section:

```tsx
<FileExplorerPanel project={project} />
```

Keep the existing `max-w-4xl` container unless the panel feels cramped during visual QA. If it is cramped, change the wrapper from `max-w-4xl` to `max-w-5xl`; do not widen beyond `max-w-5xl` because the existing app uses calm, focused workspace surfaces.

- [ ] **Step 3: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/web/pages/ProjectWorkspace.tsx
git commit -m "feat: show file explorer in project workspace"
```

---

### Task 8: Browser E2E For File Explorer

**Files:**
- Create: `tests/e2e/file-explorer.spec.ts`

- [ ] **Step 1: Add Playwright E2E**

Create `tests/e2e/file-explorer.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

const ok = (data: unknown) => ({ ok: true, data })

async function mockBaseApi(page: Page) {
  await page.route('**/api/config', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      port: 4096,
      host: '127.0.0.1',
      sessionTTL: 86400,
      linkExtractTimeout: 30,
      maxConcurrentSessions: 10,
      keepSessionLogsLines: 500,
      agents: {},
      globalEnv: {},
      logLevel: 'info'
    }))
  }))

  await page.route('**/api/auth/csrf', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({ csrfToken: 'test-csrf' }))
  }))

  await page.route('**/api/projects', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok([{
      id: 'project-api',
      name: 'api-service',
      path: '/home/user/workplace/personal/api-service',
      env: {},
      lastAgentId: 'claude',
      createdAt: '2026-05-29T00:00:00.000Z'
    }]))
  }))

  await page.route('**/api/sessions', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok([]))
  }))

  await page.route('**/api/agents', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok([{
      id: 'claude',
      name: 'Claude Code',
      command: 'claude',
      args: ['--remote-control'],
      env: {},
      linkPattern: 'https://claude\\.ai/code/session_[\\w]+',
      enabled: true
    }]))
  }))
}

async function mockFiles(page: Page) {
  await page.route('**/api/projects/project-api/files?**', route => {
    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') ?? ''
    if (path === 'src') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(ok({
          projectId: 'project-api',
          rootPath: '/home/user/workplace/personal/api-service',
          path: 'src',
          parent: '',
          entries: [
            { name: 'App.tsx', path: 'src/App.tsx', type: 'file', size: 64, modifiedAt: '2026-05-29T00:00:00.000Z' },
            { name: 'server.ts', path: 'src/server.ts', type: 'file', size: 86, modifiedAt: '2026-05-29T00:00:00.000Z' }
          ]
        }))
      })
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(ok({
        projectId: 'project-api',
        rootPath: '/home/user/workplace/personal/api-service',
        path: '',
        parent: null,
        entries: [
          { name: 'src', path: 'src', type: 'directory', size: null, modifiedAt: '2026-05-29T00:00:00.000Z' },
          { name: 'README.md', path: 'README.md', type: 'file', size: 40, modifiedAt: '2026-05-29T00:00:00.000Z' }
        ]
      }))
    })
  })

  await page.route('**/api/projects/project-api/files/preview?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      projectId: 'project-api',
      path: 'README.md',
      type: 'text',
      content: '# RemoteBridge\n\nA local agent control surface.',
      truncated: false,
      size: 40
    }))
  }))
}

async function openProject(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await mockBaseApi(page)
  await mockFiles(page)
  await page.goto('/project/project-api')
  await expect(page.getByRole('heading', { name: 'api-service' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'File explorer' })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    doc: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }))
  expect(Math.max(metrics.body, metrics.doc)).toBeLessThanOrEqual(metrics.viewport + 1)
}

test('desktop file explorer drills into folders and previews files', async ({ page }) => {
  await openProject(page, 1280, 800)
  await expectNoHorizontalOverflow(page)

  const explorer = page.getByRole('region', { name: 'File explorer' })
  await expect(explorer.getByRole('button', { name: /src/ })).toBeVisible()
  await explorer.getByRole('button', { name: /README.md/ }).click()
  await expect(explorer.getByText('# RemoteBridge')).toBeVisible()

  await explorer.getByRole('button', { name: /src/ }).click()
  await expect(explorer.getByRole('button', { name: /App.tsx/ })).toBeVisible()
  await expect(explorer.getByRole('button', { name: /api-service/ })).toBeVisible()
})

test('mobile file explorer stacks cleanly without overflow', async ({ page }) => {
  await openProject(page, 375, 667)
  await expectNoHorizontalOverflow(page)

  const explorer = page.getByRole('region', { name: 'File explorer' })
  const box = await explorer.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.round(box!.width)).toBeLessThanOrEqual(375)

  await explorer.getByRole('button', { name: /README.md/ }).click()
  await expect(explorer.getByText('A local agent control surface.')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
```

- [ ] **Step 2: Run E2E to verify it fails before UI integration, or passes after Task 7**

Run:

```bash
npm run test:responsive -- tests/e2e/file-explorer.spec.ts
```

Expected after Task 7: PASS. If the script ignores the extra file argument, run:

```bash
npx playwright test tests/e2e/file-explorer.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/file-explorer.spec.ts
git commit -m "test: cover file explorer browser flow"
```

---

### Task 9: Visual Polish And Smoothness Pass

**Files:**
- Modify as needed: `src/web/components/FileExplorerPanel.tsx`
- Modify as needed: `src/web/components/FilePreview.tsx`
- Modify as needed: `src/web/pages/ProjectWorkspace.tsx`

- [ ] **Step 1: Run the dev server**

Run:

```bash
npm run dev
```

Expected: Fastify on `:4096` and Vite on `:5173`.

- [ ] **Step 2: Inspect desktop layout**

Open:

```text
http://localhost:5173/project/<existing-project-id>
```

Check:

- Explorer panel uses the same dark token palette as the rest of RemoteBridge.
- Header, breadcrumbs, file rows, and preview pane align to the existing 4/8/12/16 spacing scale.
- Folder rows have clear hover and selected states.
- Text preview reads like a terminal/code pane, not a generic textarea.
- No card is nested inside another card.
- Shell action uses the existing `TerminalSquare` affordance and does not compete with "New session".

- [ ] **Step 3: Inspect mobile layout**

Use browser devtools or Playwright viewport `375x667`.

Check:

- Explorer stacks list above preview.
- File names truncate instead of forcing horizontal scroll.
- Breadcrumbs wrap without covering controls.
- Preview pane remains scrollable and readable.
- Buttons retain minimum touch target sizing.

- [ ] **Step 4: Make targeted CSS/class adjustments**

If the panel feels visually heavy, prefer these exact adjustments:

```tsx
className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/45 shadow-[var(--shadow-card)]"
```

If the workspace is too narrow, change the top wrapper in `ProjectWorkspace.tsx`:

```tsx
<div className="mx-auto flex w-full max-w-5xl flex-col gap-10 py-2">
```

If mobile rows wrap badly, add this to the filename span in `FileExplorerPanel.tsx`:

```tsx
<span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
```

- [ ] **Step 5: Re-run browser E2E**

Run:

```bash
npx playwright test tests/e2e/file-explorer.spec.ts tests/e2e/responsive-ui.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/components/FileExplorerPanel.tsx src/web/components/FilePreview.tsx src/web/pages/ProjectWorkspace.tsx
git commit -m "style: polish file explorer workspace ui"
```

---

### Task 10: Final Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- tests/routes/project-files.test.ts tests/web/file-api.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run browser E2E**

Run:

```bash
npx playwright test tests/e2e/file-explorer.spec.ts tests/e2e/responsive-ui.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Build production assets**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Manual security smoke**

With an authenticated session, verify:

```text
GET /api/projects/<projectId>/files?path=..
```

Expected: `400` with `{ ok: false, error: { code: "bad_path", message: "Path escapes project root" } }`.

Verify:

```text
GET /api/projects/<projectId>/files/preview?path=README.md
```

Expected: `200` with `{ ok: true, data: { type: "text", content: "# RemoteBridge\n", truncated: false } }`.

- [ ] **Step 7: Commit verification-only changes if any**

If E2E snapshots, test fixtures, or minor fixes changed files:

```bash
git add <changed-files>
git commit -m "test: verify file explorer end to end"
```

---

## Self-Review Notes

- Spec coverage: The plan covers secure project-scoped browsing, text preview, smooth RemoteBridge-style UI, route tests, browser E2E, responsive behavior, and final verification.
- Phase boundary: No Gemini, OpenCode, Codex, or other provider logic is added.
- Security boundary: All new routes live in the protected route group, use existing session auth, and are read-only GET routes. Path traversal and symlink escape are rejected by realpath confinement.
- UI consistency: The explorer uses existing CSS variables, Lucide icons, `rb-*` button/input primitives, monospace preview text, 8px radius, and no nested cards.
- Known implementation choice: `/api/fs/browse` remains unchanged for the project picker; project workspace browsing uses new project-scoped APIs.
