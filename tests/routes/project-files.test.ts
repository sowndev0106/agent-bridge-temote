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
