import * as nodePty from 'node-pty'
import { randomUUID } from 'crypto'
import { resolveCommand } from '../sessions/agent-catalog.js'
import { buildTerminalEnv } from '../core/terminal-env.js'

type PtyProcess = ReturnType<typeof nodePty.spawn>

export interface TerminalInfo {
  id: string
  title: string
  pid: number
  cwd: string
  createdAt: string
}

type TerminalEventCallback = (event: { type: string; payload: unknown }) => void

export class TerminalManager {
  private terminals = new Map<string, { info: TerminalInfo; pty: PtyProcess }>()
  private onEvent: TerminalEventCallback

  constructor(onEvent: TerminalEventCallback) {
    this.onEvent = onEvent
  }

  create(cwd?: string): TerminalInfo {
    const id = randomUUID()
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
    const resolvedCmd = resolveCommand(shell)
    const effectiveCwd = cwd || process.env.HOME || '/'

    const pty = nodePty.spawn(resolvedCmd, [], {
      name: 'xterm-256color',
      cwd: effectiveCwd,
      env: buildTerminalEnv(),
      cols: 120,
      rows: 30
    })

    const info: TerminalInfo = {
      id,
      title: `Terminal ${this.terminals.size + 1}`,
      pid: pty.pid,
      cwd: effectiveCwd,
      createdAt: new Date().toISOString()
    }

    this.terminals.set(id, { info, pty })

    pty.onData((data: string) => {
      this.onEvent({ type: 'terminal.data', payload: { terminalId: id, data } })
    })

    pty.onExit(() => {
      this.terminals.delete(id)
      this.onEvent({ type: 'terminal.closed', payload: { terminalId: id } })
    })

    return info
  }

  write(id: string, data: string): void {
    const entry = this.terminals.get(id)
    if (!entry) return
    entry.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.terminals.get(id)
    if (!entry) return
    entry.pty.resize(cols, rows)
  }

  close(id: string): void {
    const entry = this.terminals.get(id)
    if (!entry) return
    entry.pty.kill()
    this.terminals.delete(id)
  }

  list(): TerminalInfo[] {
    return Array.from(this.terminals.values()).map(e => e.info)
  }

  has(id: string): boolean {
    return this.terminals.has(id)
  }

  async killAll(): Promise<void> {
    for (const [_id, entry] of this.terminals) {
      try { entry.pty.kill() } catch { /* already gone */ }
    }
    this.terminals.clear()
  }
}
