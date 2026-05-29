import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { atomicWrite, readJson, ensureDir } from '../../src/server/core/persistence.js'

let tmpDir: string

beforeEach(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'rb-')) })
afterEach(async () => { await rm(tmpDir, { recursive: true }) })

describe('persistence', () => {
  it('atomicWrite writes and readJson reads back', async () => {
    const file = join(tmpDir, 'data.json')
    await atomicWrite(file, { hello: 'world' })
    const result = await readJson<{ hello: string }>(file)
    expect(result).toEqual({ hello: 'world' })
  })

  it('readJson returns null when file does not exist', async () => {
    const result = await readJson(join(tmpDir, 'nope.json'))
    expect(result).toBeNull()
  })

  it('ensureDir creates directory with mode 0o700', async () => {
    const dir = join(tmpDir, 'subdir')
    await ensureDir(dir)
    const { statSync } = await import('fs')
    const stat = statSync(dir)
    expect(stat.isDirectory()).toBe(true)
    expect(stat.mode & 0o777).toBe(0o700)
  })
})
