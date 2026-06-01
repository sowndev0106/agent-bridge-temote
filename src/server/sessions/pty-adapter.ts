import * as nodePty from 'node-pty'
import { createServer } from 'net'
import { AgentAdapter, LaunchOptions } from './adapter.js'
import { SessionManager, LineBuffer, stripTerminalSequences } from './manager.js'
import { resolveAgent, resolveCommand } from './agent-catalog.js'
import { extractLink } from './link-extractor.js'
import { buildTerminalEnv } from '../core/terminal-env.js'

type PtyProcess = ReturnType<typeof nodePty.spawn>

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'string' ? 0 : address?.port ?? 0
      server.close(() => {
        resolve(port)
      })
    })
  })
}

function isClaudeCommand(command: string): boolean {
  return /(^|[/\\])claude(\.(cmd|bat|exe))?$/i.test(command)
}

export class PtyAgentAdapter implements AgentAdapter {
  private manager: SessionManager
  private processes = new Map<string, PtyProcess>()
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private rawDataListeners = new Map<string, Set<(data: string) => void>>()

  constructor(manager: SessionManager) {
    this.manager = manager
  }

  async launch(sessionId: string, options: LaunchOptions, isRestart = false): Promise<void> {
    const session = this.manager.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const agent = resolveAgent(session.agentId, options.config.agents)
    if (!agent) throw new Error(`Unknown agent: ${session.agentId}`)
    if (!agent.enabled) throw new Error(`Agent "${agent.name}" is not enabled in Phase 1`)

    const env = buildTerminalEnv({
      ...options.config.globalEnv,
      ...options.project.env,
      ...agent.env
    })

    let args = [...agent.args]
    const hasPortPlaceholder = args.some(arg => arg.includes('{{port}}'))
    if (hasPortPlaceholder) {
      const freePort = await getFreePort()
      args = args.map(arg => arg.replace('{{port}}', String(freePort)))
    }

    if (session.agentId === 'claude') {
      const claudeSessionId = session.providerSessionId ?? session.id
      if (isRestart && session.providerSessionId) {
        args = isClaudeCommand(agent.command)
          ? ['--resume', claudeSessionId, ...args]
          : [...args, '--resume', claudeSessionId]
      } else {
        args = [...args, '--session-id', claudeSessionId]
      }
      if (!session.providerSessionId) {
        session.providerSessionId = claudeSessionId
      }
    }

    const child = nodePty.spawn(resolveCommand(agent.command), args, {
      name: 'xterm-256color',
      cwd: options.project.path,
      env,
      cols: 220,
      rows: 50
    })

    session.pid = child.pid
    this.processes.set(sessionId, child)
    this.manager.persistSessions()

    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    const systemLaunchLog = `[${timestamp}] [System] Launching agent: ${agent.command} ${args.join(' ')}`
    this.manager.logSession(sessionId, systemLaunchLog)

    if (agent.linkPattern) {
      const timeout = setTimeout(() => {
        const s = this.manager.getSession(sessionId)
        if (s?.state === 'launching') {
          this.manager.updateSession(sessionId, {
            state: 'failed',
            error: `No remote link found within ${options.config.linkExtractTimeout}s`,
            stoppedAt: new Date().toISOString()
          })
        }
      }, options.config.linkExtractTimeout * 1000)
      this.timeouts.set(sessionId, timeout)
    } else {
      this.manager.updateSession(sessionId, { state: 'running' })
    }

    const handleLine = (line: string) => {
      const s = this.manager.getSession(sessionId)
      if (!s) return

      if (/trust this folder|1\.\s*Yes.*trust/i.test(line)) {
        child.write('\r')
        return
      }

      const clean = stripTerminalSequences(line)
      if (!clean) return

      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
      const logWithTime = `[${timestamp}] ${clean}`
      this.manager.logSession(sessionId, logWithTime)

      if (s.state === 'launching' && agent.linkPattern) {
        const link = extractLink(clean, agent.linkPattern)
        if (link) {
          const t = this.timeouts.get(sessionId)
          if (t) clearTimeout(t)
          this.timeouts.delete(sessionId)
          this.manager.updateSession(sessionId, { state: 'running', remoteLink: link })
        }
      }
    }

    const lineBuf = new LineBuffer()
    child.onData((data: string) => {
      const listeners = this.rawDataListeners.get(sessionId)
      if (listeners) {
        for (const fn of listeners) fn(data)
      }
      for (const line of lineBuf.push(data)) handleLine(line)
    })

    child.onExit(() => {
      const tail = lineBuf.flush()
      if (tail) handleLine(tail)
      const t = this.timeouts.get(sessionId)
      if (t) clearTimeout(t)
      this.timeouts.delete(sessionId)
      this.processes.delete(sessionId)
      this.rawDataListeners.delete(sessionId)
      const s = this.manager.getSession(sessionId)
      if (s && s.state !== 'stopped') {
        this.manager.updateSession(sessionId, { state: 'stopped', stoppedAt: new Date().toISOString() })
      }
    })
  }

  stop(sessionId: string): void {
    const child = this.processes.get(sessionId)
    if (!child) {
      this.manager.updateSession(sessionId, { state: 'stopped', stoppedAt: new Date().toISOString() })
      return
    }
    child.kill('SIGTERM')
    setTimeout(() => {
      if (this.processes.has(sessionId)) child.kill('SIGKILL')
    }, 5000)
  }

  write(sessionId: string, data: string): boolean {
    const child = this.processes.get(sessionId)
    if (!child) return false
    child.write(data)
    return true
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const child = this.processes.get(sessionId)
    if (!child) return false
    child.resize(cols, rows)
    return true
  }

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

  async killAll(): Promise<void> {
    const children = Array.from(this.processes.values())
    if (children.length === 0) return

    const exits = children.map(child => new Promise<void>(resolve => {
      child.onExit(() => resolve())
    }))
    for (const child of children) {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }

    await Promise.race([
      Promise.all(exits),
      new Promise<void>(resolve => setTimeout(resolve, 1000))
    ])
    for (const child of children) {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }
  }
}
