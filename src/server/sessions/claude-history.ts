import { readdir, readFile, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeProjectPath(projectPath: string): string {
  return resolve(projectPath)
}

function claudeProjectDirName(projectPath: string): string {
  return normalizeProjectPath(projectPath).replace(/[\\/]+/g, '-')
}

async function fromHistory(projectPath: string): Promise<string | null> {
  const historyFile = join(homedir(), '.claude', 'history.jsonl')
  let text: string
  try {
    text = await readFile(historyFile, 'utf8')
  } catch {
    return null
  }

  const normalized = normalizeProjectPath(projectPath)
  const lines = text.split('\n').filter(Boolean).reverse()
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as { project?: string; sessionId?: string }
      if (row.project && normalizeProjectPath(row.project) === normalized && row.sessionId && UUID_RE.test(row.sessionId)) {
        return row.sessionId
      }
    } catch {
      // Ignore malformed history rows.
    }
  }
  return null
}

async function fromProjectFiles(projectPath: string): Promise<string | null> {
  const projectDir = join(homedir(), '.claude', 'projects', claudeProjectDirName(projectPath))
  let entries: string[]
  try {
    entries = await readdir(projectDir)
  } catch {
    return null
  }

  const candidates = await Promise.all(entries
    .filter(name => name.endsWith('.jsonl'))
    .map(async name => {
      const id = basename(name, '.jsonl')
      if (!UUID_RE.test(id)) return null
      const path = join(projectDir, name)
      try {
        const s = await stat(path)
        return { id, mtimeMs: s.mtimeMs }
      } catch {
        return null
      }
    }))

  return candidates
    .filter((c): c is { id: string; mtimeMs: number } => c !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.id ?? null
}

export async function resolveClaudeProviderSessionId(projectPath: string): Promise<string | null> {
  return await fromHistory(projectPath) ?? await fromProjectFiles(projectPath)
}
