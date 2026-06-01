import { describe, expect, test, vi, beforeEach } from 'vitest'
import { CodexAgentAdapter } from '../../src/server/sessions/codex-adapter.js'
import { SessionManager } from '../../src/server/sessions/manager.js'
import { spawn } from 'child_process'
import { Readable, Writable } from 'stream'

vi.mock('child_process', () => ({
  spawn: vi.fn()
}))

describe('CodexAgentAdapter', () => {
  let manager: SessionManager
  let adapter: CodexAgentAdapter

  beforeEach(() => {
    vi.clearAllMocks()
    manager = {
      getSession: vi.fn().mockReturnValue({
        id: 'session_1',
        agentId: 'codex',
        projectId: 'project_1',
        state: 'launching',
        providerSessionId: null,
        logs: []
      }),
      updateSession: vi.fn(),
      logSession: vi.fn(),
      persistSessions: vi.fn()
    } as any

    adapter = new CodexAgentAdapter(manager)
  })

  test('launch spawns codex process and sends initialize request', async () => {
    const mockStdout = new Readable({ read() {} })
    const mockStdin = new Writable({ write(chunk, enc, cb) { cb() } })
    const mockStderr = new Readable({ read() {} })

    const mockProcess = {
      pid: 12345,
      stdout: mockStdout,
      stdin: mockStdin,
      stderr: mockStderr,
      on: vi.fn()
    }

    vi.mocked(spawn).mockReturnValue(mockProcess as any)

    const launchPromise = adapter.launch('session_1', {
      project: { path: '/workspace', env: {} },
      config: { globalEnv: {}, agents: {} } as any
    })

    // Give adapter time to spawn and send first request
    await new Promise(r => setTimeout(r, 10))

    // Simulate stdout containing JSON-RPC responses for initialize
    mockStdout.push(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } }) + '\n')

    // Give adapter time to process initialize and send thread/start
    await new Promise(r => setTimeout(r, 10))

    // Simulate thread/start response
    mockStdout.push(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { thread: { id: 'thread_abc' } } }) + '\n')

    await launchPromise

    expect(spawn).toHaveBeenCalledWith('codex', ['app-server', '--listen', 'stdio://'], expect.any(Object))
    expect(manager.updateSession).toHaveBeenCalledWith('session_1', { state: 'running' })
  })

  test('sendMessage formats turn/start input as an array of UserInput', async () => {
    const mockStdout = new Readable({ read() {} })
    let written = ''
    const mockStdin = new Writable({
      write(chunk, enc, cb) {
        written += chunk.toString()
        cb()
      }
    })
    const mockStderr = new Readable({ read() {} })

    const mockProcess = {
      pid: 12345,
      stdout: mockStdout,
      stdin: mockStdin,
      stderr: mockStderr,
      on: vi.fn()
    }

    vi.mocked(spawn).mockReturnValue(mockProcess as any)

    const launchPromise = adapter.launch('session_1', {
      project: { path: '/workspace', env: {} },
      config: { globalEnv: {}, agents: {} } as any
    })

    await new Promise(r => setTimeout(r, 10))
    mockStdout.push(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } }) + '\n')
    await new Promise(r => setTimeout(r, 10))
    mockStdout.push(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { thread: { id: 'thread_abc' } } }) + '\n')
    await launchPromise

    written = ''

    const sendPromise = adapter.sendMessage('session_1', 'hello codex')

    await new Promise(r => setTimeout(r, 10))

    const req = JSON.parse(written.trim())
    expect(req.method).toBe('turn/start')
    expect(req.params.threadId).toBe('thread_abc')
    expect(req.params.input).toEqual([
      {
        type: 'text',
        text: 'hello codex',
        text_elements: []
      }
    ])

    mockStdout.push(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { turn: { id: 'turn_1' } } }) + '\n')
    await sendPromise
  })
})
