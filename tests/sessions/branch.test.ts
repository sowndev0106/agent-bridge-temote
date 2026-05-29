import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { detectGitBranch } from '../../src/server/sessions/branch'

let root: string
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'rb-branch-')) })
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

async function makeRepo(name: string, head: string): Promise<string> {
  const dir = join(root, name)
  await mkdir(join(dir, '.git'), { recursive: true })
  await writeFile(join(dir, '.git', 'HEAD'), head)
  return dir
}

describe('detectGitBranch', () => {
  it('reads the branch from a ref symref', async () => {
    const dir = await makeRepo('plain', 'ref: refs/heads/main\n')
    expect(await detectGitBranch(dir)).toBe('main')
  })

  it('handles branches with slashes', async () => {
    const dir = await makeRepo('slash', 'ref: refs/heads/feat/cool-stuff\n')
    expect(await detectGitBranch(dir)).toBe('feat/cool-stuff')
  })

  it('returns short sha for detached HEAD', async () => {
    const sha = 'a1b2c3d4e5f6071829304a5b6c7d8e9f0a1b2c3d'
    const dir = await makeRepo('detached', sha + '\n')
    expect(await detectGitBranch(dir)).toBe('a1b2c3d')
  })

  it('follows .git pointer files (linked worktree)', async () => {
    const realRepo = await makeRepo('upstream', 'ref: refs/heads/release\n')
    const linkedDir = join(root, 'worktree')
    await mkdir(linkedDir, { recursive: true })
    await writeFile(join(linkedDir, '.git'), `gitdir: ${join(realRepo, '.git')}\n`)
    expect(await detectGitBranch(linkedDir)).toBe('release')
  })

  it('returns null for a non-git directory', async () => {
    const dir = join(root, 'plain-dir')
    await mkdir(dir, { recursive: true })
    expect(await detectGitBranch(dir)).toBeNull()
  })

  it('returns null when path does not exist', async () => {
    expect(await detectGitBranch(join(root, 'nope-' + Date.now()))).toBeNull()
  })

  it('returns null for malformed HEAD', async () => {
    const dir = await makeRepo('malformed', 'garbage content\n')
    expect(await detectGitBranch(dir)).toBeNull()
  })
})
