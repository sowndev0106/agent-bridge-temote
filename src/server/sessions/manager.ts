import * as nodePty from 'node-pty'
import { randomUUID } from 'crypto'
import { extractLink } from './link-extractor.js'
import { resolveAgent, resolveCommand } from './agent-catalog.js'
import { atomicWrite, readJson } from '../core/persistence.js'
import { buildTerminalEnv } from '../core/terminal-env.js'
import type { Session, AppConfig } from '../../types.js'

// node-pty provides a real PTY — required because claude (and similar agents)
// check for TTY on startup and refuse to run in --print mode without one.
type PtyProcess = ReturnType<typeof nodePty.spawn>

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
  private processes = new Map<string, PtyProcess>()
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private rawDataListeners = new Map<string, Set<(data: string) => void>>()
  private opts: ManagerOptions
  // Persists are fire-and-forget on the hot path, but SERIALIZED through this chain so two
  // atomicWrites never race (last-writer-wins on the same file would otherwise be
  // nondeterministic). flush() awaits the chain — used by shutdown and tests.
  private persistChain: Promise<void> = Promise.resolve()

  constructor(opts: ManagerOptions) {
    this.opts = opts
  }

  private persistSessions(): void {
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
    const session: Session = {
      id: randomUUID(),
      projectId: init.projectId,
      agentId: init.agentId,
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
    const t = this.timeouts.get(id)
    if (t) clearTimeout(t)
    this.timeouts.delete(id)
    this.persistSessions()
  }

  async launch(sessionId: string, options: {
    project: { path: string; env: Record<string, string> }
    config: AppConfig
  }): Promise<void> {
    const session = this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const agent = resolveAgent(session.agentId, options.config.agents)
    if (!agent) throw new Error(`Unknown agent: ${session.agentId}`)
    if (!agent.enabled) throw new Error(`Agent "${agent.name}" is not enabled in Phase 1`)

    // Merge env: process.env → globalEnv → project.env → agent.env, then force color
    // support (strips inherited NO_COLOR/FORCE_COLOR, sets TERM + COLORTERM=truecolor)
    // so the agent's TUI renders full color instead of being suppressed.
    const env = buildTerminalEnv({
      ...options.config.globalEnv,
      ...options.project.env,
      ...agent.env
    })

    // node-pty spawns with a real PTY — required for agents that check for TTY (claude, gemini).
    // resolveCommand appends .cmd on Windows for npm-installed global bins.
    const child = nodePty.spawn(resolveCommand(agent.command), agent.args, {
      name: 'xterm-256color',
      cwd: options.project.path,
      env,
      cols: 220,
      rows: 50
    })

    session.pid = child.pid
    this.processes.set(sessionId, child)
    this.persistSessions() // persist PID immediately

    // Set link-extract timeout
    const timeout = setTimeout(() => {
      const s = this.getSession(sessionId)
      if (s?.state === 'launching') {
        this.updateSession(sessionId, {
          state: 'failed',
          error: `No remote link found within ${this.opts.linkExtractTimeout}s`,
          stoppedAt: new Date().toISOString()
        })
      }
    }, this.opts.linkExtractTimeout * 1000)
    this.timeouts.set(sessionId, timeout)

    const handleLine = (line: string) => {
      const s = this.getSession(sessionId)
      if (!s) return

      // Auto-accept claude's "trust this folder?" prompt.
      // The user registered this project in RemoteBridge, so trust is implicit.
      if (/trust this folder|1\.\s*Yes.*trust/i.test(line)) {
        child.write('\r')
        return
      }

      // Strip ANSI escape codes before logging and link extraction
      const clean = line.replace(/\x1b\[[0-9;?=>]*[a-zA-Z]/g, '').trim()
      if (!clean) return

      s.logs.push(clean)
      if (s.logs.length > this.opts.keepSessionLogsLines) s.logs.shift()
      this.opts.onEvent({ type: 'session.log', payload: { sessionId, line: clean } })

      if (s.state === 'launching') {
        const link = extractLink(clean, agent.linkPattern)
        if (link) {
          const t = this.timeouts.get(sessionId)
          if (t) clearTimeout(t)
          this.timeouts.delete(sessionId)
          this.updateSession(sessionId, { state: 'running', remoteLink: link })
        }
      }
    }

    // node-pty merges stdout+stderr into a single onData stream (string, not Buffer).
    const lineBuf = new LineBuffer()
    child.onData((data: string) => {
      // Emit raw data for interactive terminal listeners
      const listeners = this.rawDataListeners.get(sessionId)
      if (listeners) {
        for (const fn of listeners) fn(data)
      }
      for (const line of lineBuf.push(data)) handleLine(line)
    })

    child.onExit(() => {
      const tail = lineBuf.flush()
      if (tail) handleLine(tail)  // flush final fragment
      const t = this.timeouts.get(sessionId)
      if (t) clearTimeout(t)
      this.timeouts.delete(sessionId)
      this.processes.delete(sessionId)
      this.rawDataListeners.delete(sessionId)
      const s = this.getSession(sessionId)
      if (s && s.state !== 'stopped') {
        this.updateSession(sessionId, { state: 'stopped', stoppedAt: new Date().toISOString() })
      }
    })
  }

  stop(sessionId: string): void {
    const child = this.processes.get(sessionId)
    if (!child) {
      this.updateSession(sessionId, { state: 'stopped', stoppedAt: new Date().toISOString() })
      return
    }
    child.kill('SIGTERM')
    setTimeout(() => {
      if (this.processes.has(sessionId)) child.kill('SIGKILL')
    }, 5000)
  }

  /** Write raw input to session PTY (interactive terminal mode) */
  writeToSession(sessionId: string, data: string): boolean {
    const child = this.processes.get(sessionId)
    if (!child) return false
    child.write(data)
    return true
  }

  /** Resize session PTY (interactive terminal mode) */
  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const child = this.processes.get(sessionId)
    if (!child) return false
    child.resize(cols, rows)
    return true
  }

  /** Check if a session has an active PTY process */
  hasProcess(sessionId: string): boolean {
    return this.processes.has(sessionId)
  }

  onRawData(sessionId: string, listener: (data: string) => void): () => void {
    if (!this.rawDataListeners.has(sessionId)) {
      this.rawDataListeners.set(sessionId, new Set())
    }
    this.rawDataListeners.get(sessionId)!.add(listener)
    return () => {
      this.rawDataListeners.get(sessionId)?.delete(listener)
      if (this.rawDataListeners.get(sessionId)?.size === 0) {
        this.rawDataListeners.delete(sessionId)
      }
    }
  }

  // Called on shutdown (SIGINT/SIGTERM, e.g. PM2 stop/restart) so no spawned agent is
  // orphaned (FR3 / ADR-0002). PTY handles live in this.processes, so we only ever signal
  // processes we spawned — never a bare/reused PID (H10).
  //
  // PM2's default kill_timeout (~1.6s) is shorter than stop()'s 5s grace period, so a
  // graceful drain would be cut short and PM2 would orphan the agents. Instead we SIGTERM
  // all, await their exits with a short bound (< kill_timeout), then SIGKILL any stragglers
  // ourselves and resolve. `remotebridge install` registers PM2 with --kill-timeout 6000 so
  // this escalation has room to complete.
  async killAll(): Promise<void> {
    const children = Array.from(this.processes.values())
    if (children.length === 0) return

    const exits = children.map(child => new Promise<void>(resolve => {
      child.onExit(() => resolve())
    }))
    for (const child of children) {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }

    // Wait up to ~1s for graceful exits, then force-kill whatever remains.
    await Promise.race([
      Promise.all(exits),
      new Promise<void>(resolve => setTimeout(resolve, 1000))
    ])
    for (const child of children) {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }
  }

  async restart(sessionId: string, options: { project: { path: string; env: Record<string, string> }; config: AppConfig }): Promise<void> {
    const session = this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    this.stop(sessionId)
    await new Promise(r => setTimeout(r, 200))
    this.updateSession(sessionId, {
      state: 'launching',
      remoteLink: null,
      pid: null,
      logs: [],
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      error: null
    })
    await this.launch(sessionId, options)
  }
}
