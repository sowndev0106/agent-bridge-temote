import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/web/lib/api'

const ok = (data: unknown) => ({ ok: true, data })

describe('file explorer api client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('encodes project file paths for list, preview, and edit calls', async () => {
    const calls: { url: string; method?: string; body?: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method,
        body: init?.body as string | undefined
      })
      return new Response(JSON.stringify(ok({
        projectId: 'project-1',
        rootPath: '/workspace/app',
        path: 'src/components',
        parent: 'src',
        entries: [],
        success: true
      })), { headers: { 'content-type': 'application/json' } })
    }))

    await api.listProjectFiles('project-1', 'src/components')
    await api.getProjectFilePreview('project-1', 'src/App.tsx')
    await api.writeProjectFile('project-1', 'src/App.tsx', 'new-content')

    expect(calls).toEqual([
      { url: '/api/projects/project-1/files?path=src%2Fcomponents', method: 'GET', body: undefined },
      { url: '/api/projects/project-1/files/preview?path=src%2FApp.tsx', method: 'GET', body: undefined },
      { url: '/api/projects/project-1/files?path=src%2FApp.tsx', method: 'PUT', body: JSON.stringify({ content: 'new-content' }) }
    ])
  })
})
