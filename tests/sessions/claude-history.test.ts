import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { resolveClaudeProviderSessionId } from '../../src/server/sessions/claude-history.js'

const projectPath = '/home/sown/workplace/personal/agent-bridge-temote'
const projectDirName = '-home-sown-workplace-personal-agent-bridge-temote'

describe('resolveClaudeProviderSessionId', () => {
  const claudeDir = join(homedir(), '.claude')

  beforeEach(async () => {
    await rm(claudeDir, { recursive: true, force: true })
  })

  afterEach(async () => {
    await rm(claudeDir, { recursive: true, force: true })
  })

  it('returns the latest Claude session id for a project from history', async () => {
    await mkdir(claudeDir, { recursive: true })
    await writeFile(join(claudeDir, 'history.jsonl'), [
      JSON.stringify({ project: projectPath, sessionId: 'bd1374b2-5452-41ad-863e-6b33d7c82f51', timestamp: 1 }),
      JSON.stringify({ project: '/tmp/other', sessionId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', timestamp: 2 }),
      JSON.stringify({ project: `${projectPath}/`, sessionId: '437b4b6c-46b4-4e03-b8ce-e840b6762d1c', timestamp: 3 })
    ].join('\n'))

    await expect(resolveClaudeProviderSessionId(projectPath)).resolves.toBe('437b4b6c-46b4-4e03-b8ce-e840b6762d1c')
  })

  it('falls back to the newest project jsonl filename when history is missing', async () => {
    const projectDir = join(claudeDir, 'projects', projectDirName)
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, '11111111-1111-4111-8111-111111111111.jsonl'), '{}\n')
    await new Promise(resolve => setTimeout(resolve, 10))
    await writeFile(join(projectDir, '437b4b6c-46b4-4e03-b8ce-e840b6762d1c.jsonl'), '{}\n')

    await expect(resolveClaudeProviderSessionId(projectPath)).resolves.toBe('437b4b6c-46b4-4e03-b8ce-e840b6762d1c')
  })

  it('returns null when no Claude session can be found', async () => {
    await mkdir(join(tmpdir(), 'rb-empty-claude'), { recursive: true })

    await expect(resolveClaudeProviderSessionId(projectPath)).resolves.toBeNull()
  })
})
