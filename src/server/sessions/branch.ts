import { readFile, stat } from 'fs/promises'
import { isAbsolute, join } from 'path'

/**
 * Resolve the current git branch for a working directory without shelling out.
 * Reads `.git/HEAD` (or the indirected gitdir when `.git` is a worktree pointer file).
 * Returns the branch name, a 7-char short SHA for a detached HEAD, or null when the
 * path is not a git working tree or anything goes wrong (silent — this is best-effort).
 */
export async function detectGitBranch(projectPath: string): Promise<string | null> {
  try {
    const gitEntry = join(projectPath, '.git')
    const s = await stat(gitEntry).catch(() => null)
    if (!s) return null

    let headPath: string
    if (s.isDirectory()) {
      headPath = join(gitEntry, 'HEAD')
    } else {
      // Linked worktree / submodule: .git is a text file "gitdir: <path>"
      const content = (await readFile(gitEntry, 'utf8')).trim()
      const m = content.match(/^gitdir:\s*(.+)$/)
      if (!m) return null
      const dir = m[1].trim()
      const gitDir = isAbsolute(dir) ? dir : join(projectPath, dir)
      headPath = join(gitDir, 'HEAD')
    }

    const head = (await readFile(headPath, 'utf8')).trim()
    const refMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/)
    if (refMatch) return refMatch[1]

    // Detached HEAD: HEAD contains a raw SHA.
    if (/^[0-9a-f]{40}$/i.test(head)) return head.slice(0, 7)
    return null
  } catch {
    return null
  }
}
