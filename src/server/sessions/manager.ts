import { randomUUID } from 'crypto'
import { resolveAgent } from './agent-catalog.js'
import { atomicWrite, readJson } from '../core/persistence.js'
import type { Session, AppConfig } from '../../types.js'
import { PtyAgentAdapter } from './pty-adapter.js'
import type { AgentAdapter } from './adapter.js'

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

// onData delivers ARBITRARY chunks, not whole lines — a line (including the remote link)
// can be split across two chunks. Buffer until newline so the link pattern never runs
// against a partial line. Extracted so the split-chunk case is unit-testable.
export class LineBuffer {
  private buf = ''
  push(data: string): string[] {
    this.buf += data
    const lines = this.buf.split('\n')
    this.buf = lines.pop() ?? ''   // unterminated tail carries over to next chunk
    return lines
  }
  flush(): string | null {
    if (!this.buf) return null
    const tail = this.buf
    this.buf = ''
    return tail
  }
}

type WsEventCallback = (event: { type: string; payload: unknown }) => void

interface ManagerOptions {
  keepSessionLogsLines: number
  linkExtractTimeout: number
  maxConcurrentSessions: number
  sessionsFile: string
  onEvent: WsEventCallback
}

export class SessionManager {
  private sessions = new Map<string, Session>()
  private ptyAdapter: PtyAgentAdapter
  private opts: ManagerOptions
  // Persists are fire-and-forget on the hot path, but SERIALIZED through this chain so two
  // atomicWrites never race (last-writer-wins on the same file would otherwise be
  // nondeterministic). flush() awaits the chain — used by shutdown and tests.
  private persistChain: Promise<void> = Promise.resolve()

  constructor(opts: ManagerOptions) {
    this.opts = opts
    this.ptyAdapter = new PtyAgentAdapter(this)
  }

  private getAdapter(agentId: string): AgentAdapter {
    // Phase 1: Only PtyAgentAdapter exists. Phase 2 Codex details will go here.
    return this.ptyAdapter
  }

  public persistSessions(): void {
    // logs are ephemeral — strip before saving. Snapshot is taken now (at call time).
    const toSave = Array.from(this.sessions.values()).map(s => ({ ...s, logs: [] }))
    this.persistChain = this.persistChain
      .catch(() => {})                 // a prior failure must not stall later writes
      .then(() => atomicWrite(this.opts.sessionsFile, toSave))
      .catch(err => {
        console.error('[SessionManager] Failed to persist sessions:', (err as Error).message)
      })
  }

  // Resolve once all queued persists have flushed to disk.
  async flush(): Promise<void> {
    await this.persistChain.catch(() => {})
  }

  async loadAndRecover(): Promise<void> {
    const saved = await readJson<Session[]>(this.opts.sessionsFile) ?? []
    for (const session of saved) {
      session.logs = [] // logs are not persisted
      // Back-compat: pre-Phase-2 records have no `title` / `branch` fields.
      if (!('title' in session)) (session as Session).title = null
      if (!('branch' in session)) (session as Session).branch = null
      if (!('providerSessionId' in session)) (session as Session).providerSessionId = null
      // PTY handles do not survive a RemoteBridge restart, so we can no longer
      // control a previously running agent. Always mark prior launching/running
      // sessions as stopped. Do NOT kill by bare PID — it may have been reused by
      // an unrelated process (would violate H1/H10). See ADR-0002.
      if (session.state === 'launching' || session.state === 'running') {
        if (session.pid != null && isPidAlive(session.pid)) {
          console.warn(`[SessionManager] Session ${session.id} PID ${session.pid} may still be alive after restart; marking stopped without killing (PID-reuse safety).`)
        }
        session.state = 'stopped'
        session.stoppedAt = session.stoppedAt ?? new Date().toISOString()
      }
      this.sessions.set(session.id, session)
    }
    // Write back cleaned state synchronously before server starts accepting requests
    const toSave = Array.from(this.sessions.values()).map(s => ({ ...s, logs: [] }))
    await atomicWrite(this.opts.sessionsFile, toSave)
  }

  createSession(init: { projectId: string; agentId: string; title?: string | null; branch?: string | null }): Session {
    const trimmed = init.title?.trim()
    const id = randomUUID()
    const session: Session = {
      id,
      projectId: init.projectId,
      agentId: init.agentId,
      providerSessionId: init.agentId === 'claude' ? id : null,
      title: trimmed && trimmed.length > 0 ? trimmed.slice(0, 80) : null,
      branch: init.branch ?? null,
      pid: null,
      state: 'launching',
      remoteLink: null,
      logs: [],
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      error: null
    }
    this.sessions.set(session.id, session)
    this.persistSessions()
    return session
  }

  getSession(id: string): Session | null {
    return this.sessions.get(id) ?? null
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  updateSession(id: string, patch: Partial<Session>): Session {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`Session ${id} not found`)
    Object.assign(session, patch)
    // Strip logs from the broadcast — logs flow only via 'session.log' events and
    // the initial GET /api/sessions snapshot. Re-sending them here would clobber the
    // client's appended logs and waste bandwidth (up to keepSessionLogsLines per event).
    const { logs: _logs, ...rest } = session
    this.opts.onEvent({ type: 'session.updated', payload: rest })
    this.persistSessions()
    return session
  }

  removeSession(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (session.state === 'running' || session.state === 'launching') {
      throw new Error(`Cannot remove session in state "${session.state}". Stop it first.`)
    }
    this.sessions.delete(id)
    this.persistSessions()
  }

  async launch(sessionId: string, options: {
    project: { path: string; env: Record<string, string> }
    config: AppConfig
  }, isRestart = false): Promise<void> {
    const session = this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const adapter = this.getAdapter(session.agentId)
    await adapter.launch(sessionId, options, isRestart)
  }

  stop(sessionId: string): void {
    const session = this.getSession(sessionId)
    if (!session) return
    const adapter = this.getAdapter(session.agentId)
    adapter.stop(sessionId)
  }

  /** Write raw input to session PTY (interactive terminal mode) */
  writeToSession(sessionId: string, data: string): boolean {
    const session = this.getSession(sessionId)
    if (!session) return false
    const adapter = this.getAdapter(session.agentId) as any
    if (typeof adapter.write === 'function') {
      return adapter.write(sessionId, data)
    }
    return false
  }

  /** Resize session PTY (interactive terminal mode) */
  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const session = this.getSession(sessionId)
    if (!session) return false
    const adapter = this.getAdapter(session.agentId) as any
    if (typeof adapter.resize === 'function') {
      return adapter.resize(sessionId, cols, rows)
    }
    return false
  }

  /** Check if a session has an active PTY process */
  hasProcess(sessionId: string): boolean {
    const session = this.getSession(sessionId)
    if (!session) return false
    const adapter = this.getAdapter(session.agentId) as any
    if (typeof adapter.hasProcess === 'function') {
      return adapter.hasProcess(sessionId)
    }
    return false
  }

  onRawData(sessionId: string, listener: (data: string) => void): () => void {
    const session = this.getSession(sessionId)
    if (!session) return () => {}
    const adapter = this.getAdapter(session.agentId) as any
    if (typeof adapter.onRawData === 'function') {
      return adapter.onRawData(sessionId, listener)
    }
    return () => {}
  }

  // Called on shutdown (SIGINT/SIGTERM, e.g. PM2 stop/restart) so no spawned agent is
  // orphaned (FR3 / ADR-0002). PTY handles live in this.processes, so we only ever signal
  // processes we spawned — never a bare/reused PID (H10).
  async killAll(): Promise<void> {
    await this.ptyAdapter.killAll()
  }

  async restart(sessionId: string, options: { project: { path: string; env: Record<string, string> }; config: AppConfig }): Promise<void> {
    const session = this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    this.stop(sessionId)
    this.updateSession(sessionId, {
      state: 'launching',
      remoteLink: null,
      pid: null,
      logs: [],
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      error: null
    })
    await new Promise(r => setTimeout(r, 200))
    await this.launch(sessionId, options, true)
  }

  logSession(sessionId: string, line: string): void {
    const session = this.getSession(sessionId)
    if (!session) return
    session.logs.push(line)
    if (session.logs.length > this.opts.keepSessionLogsLines) {
      session.logs.shift()
    }
    this.opts.onEvent({ type: 'session.log', payload: { sessionId, line } })
  }
}

/**
 * Strips all ANSI escape codes, terminal control sequences (OSC, CSI, etc.), 
 * and special characters from terminal output lines.
 */
export function stripTerminalSequences(line: string): string {
  if (!line) return ''
  return line
    // 1. Strip complete OSC sequences (e.g., title changes, hyperlinks like \x1b]8;;...)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // 2. Strip incomplete OSC sequences at the end of the line
    .replace(/\x1b\][^\x07\x1b]*$/g, '')
    // 3. Strip complete CSI sequences (e.g., colors, styles, cursor positioning, and newer protocols like \x1b[<u)
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '')
    // 4. Strip incomplete CSI sequences at the end of the line
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*$/g, '')
    // 5. Strip other Escape sequences (e.g., save/restore cursor \x1b7, \x1b8, character sets like \x1b(B)
    .replace(/\x1b[\x20-\x2f]*[\x30-\x7e]/g, '')
    // 6. Strip any leftover raw ESC characters
    .replace(/\x1b/g, '')
    // 7. Strip carriage returns, newlines (if any passed in tests), and trim
    .replace(/[\r\n]/g, '')
    .trim()
}
