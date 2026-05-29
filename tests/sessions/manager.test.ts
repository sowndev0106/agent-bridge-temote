import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { SessionManager, LineBuffer } from '../../src/server/sessions/manager.js'

describe('SessionManager', () => {
  let manager: SessionManager
  let tmpDir: string
  let sessionsFile: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rb-manager-'))
    sessionsFile = join(tmpDir, 'sessions.json')
    manager = new SessionManager({
      keepSessionLogsLines: 10,
      linkExtractTimeout: 2,
      maxConcurrentSessions: 5,
      sessionsFile,
      onEvent: () => {}
    })
  })

  afterEach(async () => { await rm(tmpDir, { recursive: true }) })

  it('creates session in launching state', () => {
    const session = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    expect(session.state).toBe('launching')
    expect(session.remoteLink).toBeNull()
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
