import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { SessionManager, LineBuffer, stripTerminalSequences } from '../../src/server/sessions/manager.js'
import type { AppConfig } from '../../src/types.js'

const { spawnMock, exitCallbacks } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  exitCallbacks: [] as Array<() => void>
}))

vi.mock('node-pty', () => ({
  spawn: spawnMock
}))

function fakePty(pid: number) {
  return {
    pid,
    onData: vi.fn(),
    onExit: vi.fn((cb: () => void) => { exitCallbacks.push(cb) }),
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn()
  }
}

const baseConfig: AppConfig = {
  port: 4096,
  host: '127.0.0.1',
  password: 'hash',
  sessionSecret: 'secret',
  sessionTTL: 86400,
  linkExtractTimeout: 30,
  maxConcurrentSessions: 10,
  keepSessionLogsLines: 500,
  agents: {},
  globalEnv: {},
  logLevel: 'error'
}

describe('SessionManager', () => {
  let manager: SessionManager
  let tmpDir: string
  let sessionsFile: string
  let managersToFlush: SessionManager[]

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rb-manager-'))
    sessionsFile = join(tmpDir, 'sessions.json')
    spawnMock.mockReset()
    exitCallbacks.length = 0
    spawnMock.mockImplementation(() => fakePty(12345))
    managersToFlush = []
    manager = new SessionManager({
      keepSessionLogsLines: 10,
      linkExtractTimeout: 2,
      maxConcurrentSessions: 5,
      sessionsFile,
      onEvent: () => {}
    })
    managersToFlush.push(manager)
  })

  afterEach(async () => {
    await Promise.all(managersToFlush.map(m => m.flush()))
    await rm(tmpDir, { recursive: true })
  })

  it('creates session in launching state', () => {
    const session = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    expect(session.state).toBe('launching')
    expect(session.remoteLink).toBeNull()
    expect(session.providerSessionId).toBe(session.id)
  })

  it('persists a trimmed title (capped at 80 chars)', () => {
    const a = manager.createSession({ projectId: 'p1', agentId: 'claude', title: '  fix login bug  ' })
    expect(a.title).toBe('fix login bug')

    const long = 'x'.repeat(200)
    const b = manager.createSession({ projectId: 'p1', agentId: 'claude', title: long })
    expect(b.title?.length).toBe(80)

    const c = manager.createSession({ projectId: 'p1', agentId: 'claude', title: '   ' })
    expect(c.title).toBeNull()

    const d = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    expect(d.title).toBeNull()
  })

  it('getSession returns null for unknown id', () => {
    expect(manager.getSession('unknown')).toBeNull()
  })

  it('listSessions returns all sessions', () => {
    manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.createSession({ projectId: 'p2', agentId: 'claude' })
    expect(manager.listSessions()).toHaveLength(2)
  })

  it('removeSession deletes stopped session', () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(s.id, { state: 'stopped' })
    manager.removeSession(s.id)
    expect(manager.getSession(s.id)).toBeNull()
  })

  it('removeSession throws for running session', () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(s.id, { state: 'running' })
    expect(() => manager.removeSession(s.id)).toThrow()
  })

  it('updateSession broadcasts session.updated WITHOUT logs', () => {
    let captured: any = null
    const m = new SessionManager({
      keepSessionLogsLines: 10, linkExtractTimeout: 2, maxConcurrentSessions: 5,
      sessionsFile, onEvent: (e) => { if (e.type === 'session.updated') captured = e.payload }
    })
    managersToFlush.push(m)
    const s = m.createSession({ projectId: 'p1', agentId: 'claude' })
    m.updateSession(s.id, { state: 'running' })
    expect(captured).not.toBeNull()
    expect(captured).not.toHaveProperty('logs')
    expect(captured.state).toBe('running')
  })

  it('persists sessions across manager instances', async () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    await manager.flush()

    const manager2 = new SessionManager({ keepSessionLogsLines: 10, linkExtractTimeout: 2, maxConcurrentSessions: 5, sessionsFile, onEvent: () => {} })
    await manager2.loadAndRecover()
    // launching with no PID → marked stopped on recover
    expect(manager2.getSession(s.id)).not.toBeNull()
    expect(manager2.getSession(s.id)!.state).toBe('stopped')
  })

  it('loadAndRecover marks sessions with dead PID as stopped', async () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(s.id, { state: 'running', pid: 99999999 }) // guaranteed dead PID
    await manager.flush()

    const manager2 = new SessionManager({ keepSessionLogsLines: 10, linkExtractTimeout: 2, maxConcurrentSessions: 5, sessionsFile, onEvent: () => {} })
    await manager2.loadAndRecover()
    expect(manager2.getSession(s.id)!.state).toBe('stopped')
  })

  it('loadAndRecover does not alter a stopped session', async () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(s.id, { state: 'stopped', stoppedAt: '2026-01-01T00:00:00.000Z' })
    await manager.flush()

    const manager2 = new SessionManager({ keepSessionLogsLines: 10, linkExtractTimeout: 2, maxConcurrentSessions: 5, sessionsFile, onEvent: () => {} })
    await manager2.loadAndRecover()
    expect(manager2.getSession(s.id)!.stoppedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('killAll resolves immediately when no processes are tracked', async () => {
    await expect(manager.killAll()).resolves.toBeUndefined()
  })

  it('launches claude with a stable CLI session id so it can be resumed later', async () => {
    const session = manager.createSession({ projectId: 'p1', agentId: 'claude' })

    await manager.launch(session.id, { project: { path: tmpDir, env: {} }, config: baseConfig })

    expect(spawnMock).toHaveBeenCalledWith('claude', ['--remote-control', '--session-id', session.id], expect.objectContaining({ cwd: tmpDir }))
    exitCallbacks.at(-1)?.()
  })

  it('restarts claude by resuming the stored provider session id with remote control enabled', async () => {
    const session = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    const providerSessionId = '437b4b6c-46b4-4e03-b8ce-e840b6762d1c'
    manager.updateSession(session.id, { providerSessionId })
    await manager.launch(session.id, { project: { path: tmpDir, env: {} }, config: baseConfig })
    exitCallbacks.at(-1)?.()
    manager.updateSession(session.id, { state: 'stopped' })
    spawnMock.mockClear()

    await manager.restart(session.id, { project: { path: tmpDir, env: {} }, config: baseConfig })

    expect(spawnMock).toHaveBeenCalledWith('claude', ['--resume', providerSessionId, '--remote-control'], expect.objectContaining({ cwd: tmpDir }))
    exitCallbacks.at(-1)?.()
  })

  it('does not resume legacy claude sessions that were not launched with a stable CLI session id', async () => {
    const session = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(session.id, { state: 'stopped', providerSessionId: null })

    await manager.restart(session.id, { project: { path: tmpDir, env: {} }, config: baseConfig })

    expect(spawnMock).toHaveBeenCalledWith('claude', ['--remote-control', '--session-id', session.id], expect.objectContaining({ cwd: tmpDir }))
    exitCallbacks.at(-1)?.()
  })
})

describe('LineBuffer', () => {
  it('yields complete lines and carries the unterminated tail', () => {
    const lb = new LineBuffer()
    expect(lb.push('hello\nwor')).toEqual(['hello'])
    expect(lb.push('ld\n')).toEqual(['world'])
  })

  it('reassembles a link split across two chunks', () => {
    const lb = new LineBuffer()
    // The remote link arrives in two onData chunks; only after the newline is the
    // full line emitted, so extractLink never sees a partial URL.
    expect(lb.push('...session_01Hju')).toEqual([])
    const lines = lb.push('hke...\n')
    expect(lines).toEqual(['...session_01Hjuhke...'])
  })

  it('flush returns the trailing fragment once', () => {
    const lb = new LineBuffer()
    lb.push('partial')
    expect(lb.flush()).toBe('partial')
    expect(lb.flush()).toBeNull()
  })
})

describe('stripTerminalSequences', () => {
  it('strips basic CSI escape sequences', () => {
    expect(stripTerminalSequences('\x1b[31mRed Text\x1b[0m')).toBe('Red Text')
    expect(stripTerminalSequences('Hello \x1b[1;33mWorld\x1b[0m')).toBe('Hello World')
  })

  it('strips custom/newer CSI sequences with parameter bytes like \\x1b[<u', () => {
    expect(stripTerminalSequences('\x1b[<uText')).toBe('Text')
    expect(stripTerminalSequences('No conversation\x1b[<u found')).toBe('No conversation found')
  })

  it('strips character set sequences like \\x1b(B', () => {
    expect(stripTerminalSequences('\x1b(BText')).toBe('Text')
    expect(stripTerminalSequences('Some\x1b(B text')).toBe('Some text')
  })

  it('strips cursor saving/restoring sequences like \\x1b7 and \\x1b8', () => {
    expect(stripTerminalSequences('\x1b7\x1b8Text')).toBe('Text')
    expect(stripTerminalSequences('Before\x1b7\x1b8After')).toBe('BeforeAfter')
  })

  it('strips OSC sequences like title updates and hyperlink formatting', () => {
    expect(stripTerminalSequences('\x1b]0;* Claude\x07Text')).toBe('Text')
    expect(stripTerminalSequences('\x1b]8;;id=1xifrt4;https://claude.ai/code/session_123\x07https://claude.ai/code/session_123\x1b]8;;\x07')).toBe('https://claude.ai/code/session_123')
  })

  it('handles the complex real-world escape soup in the screenshot', () => {
    const raw = '\x1b7\x1b8\x1b[<uNo conversation found with session ID: 7c59df80-7154-4021-b887-4b4240b5cdf0\r\n\x1b(B\x1b[<u\x1b7\x1b(B\x1b[<u\x1b]0;'
    expect(stripTerminalSequences(raw)).toBe('No conversation found with session ID: 7c59df80-7154-4021-b887-4b4240b5cdf0')
  })
})

