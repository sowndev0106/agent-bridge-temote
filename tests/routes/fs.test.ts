import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { listDirectories } from '../../src/server/routes/fs'

let root: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'rb-fs-'))
  await mkdir(join(root, 'alpha'))
  await mkdir(join(root, 'beta'))
  await writeFile(join(root, 'file.txt'), 'x')
})
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

describe('listDirectories', () => {
  it('returns only subdirectories, sorted, with absolute paths', async () => {
    const res = await listDirectories(root)
    expect(res.path).toBe(root)
    expect(res.parent).toBe(dirname(root))
    expect(res.entries.map(e => e.name)).toEqual(['alpha', 'beta'])
    expect(res.entries[0].path).toBe(join(root, 'alpha'))
  })

  it('rejects paths containing null bytes', async () => {
    await expect(listDirectories(root + '\0x')).rejects.toThrow()
  })
})
