import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'fs/promises'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { WebSocket } from 'ws'
import { hashPassword, generateSecret } from '../../src/server/core/auth.js'
import { createServer } from '../../src/server/index.js'
import type { AppConfig } from '../../src/types.js'

const FAKE_AGENT = fileURLToPath(new URL('../fixtures/fake-agent.mjs', import.meta.url))
const PASSWORD = 'e2e-pass-123'

let baseUrl: string
let wsUrl: string
let server: Awaited<ReturnType<typeof createServer>>
let projectDir: string

let cookie = ''
let csrf = ''
let projectId = ''
let sessionId = ''

function setCookieToHeader(res: Response): string {
  const cookies = (res.headers as any).getSetCookie?.() ?? []
  return cookies.map((c: string) => c.split(';')[0]).join('; ')
}

async function api(method: string, path: string, body?: unknown, withCsrf = true) {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers['cookie'] = cookie
  if (withCsrf && csrf) headers['x-csrf-token'] = csrf
  return fetch(`${baseUrl}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
}

function openWs(withCookie: boolean): Promise<{ ws: WebSocket; messages: any[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, withCookie ? { headers: { cookie } } : {})
    const messages: any[] = []
    ws.on('message', (d) => { try { messages.push(JSON.parse(d.toString())) } catch { /* ignore */ } })
    ws.on('open', () => resolve({ ws, messages }))
    ws.on('unexpected-response', (_req, res) => reject(new Error(`ws status ${res.statusCode}`)))
    ws.on('error', (e) => reject(e))
  })
}

async function waitFor<T>(fn: () => T | Promise<T> | undefined, timeoutMs = 6000, stepMs = 50): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v !== undefined && v !== false) return v as T
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise(r => setTimeout(r, stepMs))
  }
}

beforeAll(async () => {
  expect(homedir().startsWith(tmpdir())).toBe(true)

  projectDir = await mkdtemp(join(tmpdir(), 'rb-e2e-term-proj-'))

  const config: AppConfig = {
    port: 4101, host: '127.0.0.1',
    password: await hashPassword(PASSWORD),
    sessionSecret: generateSecret(),
    sessionTTL: 3600, linkExtractTimeout: 10, maxConcurrentSessions: 10,
    keepSessionLogsLines: 500,
    agents: { claude: { command: process.execPath, args: [FAKE_AGENT] } },
    globalEnv: {}, logLevel: 'error'
  }
  await mkdir(join(homedir(), '.remotebridge'), { recursive: true })
  await writeFile(join(homedir(), '.remotebridge', 'config.json'), JSON.stringify(config))

  server = await createServer()
  await server.fastify.listen({ port: 0, host: '127.0.0.1' })
  const addr = server.fastify.server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  baseUrl = `http://127.0.0.1:${port}`
  wsUrl = `ws://127.0.0.1:${port}/ws`

  // Login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD })
  })
  expect(loginRes.status).toBe(200)
  cookie = setCookieToHeader(loginRes)
  csrf = (await loginRes.json()).data.csrfToken

  // Create project
  const projRes = await api('POST', '/api/projects', { name: 'E2E Terminals', path: projectDir })
  expect(projRes.status).toBe(201)
  projectId = (await projRes.json()).data.id
})

afterAll(async () => {
  await server?.manager.killAll()
  await server?.fastify.close()
})

describe('E2E Remote Terminal', () => {
  it('should support spawning, resizing, writing to, and closing a standalone terminal', async () => {
    const { ws, messages } = await openWs(true)

    // 1. Create a standalone terminal
    ws.send(JSON.stringify({ type: 'terminal.create', payload: {} }))

    const created = await waitFor(() =>
      messages.find(m => m.type === 'terminal.created')
    )
    expect(created.payload.terminalId).toBeTruthy()
    expect(created.payload.title).toMatch(/Terminal \d+/)
    expect(created.payload.pid).toBeGreaterThan(0)

    const terminalId = created.payload.terminalId

    // 2. Resize the terminal
    ws.send(JSON.stringify({
      type: 'terminal.resize',
      payload: { terminalId, cols: 80, rows: 24 }
    }))

    // 3. Write input to the terminal (e.g. echo hello)
    // Wait for initial prompt/shell output first
    await waitFor(() => messages.some(m => m.type === 'terminal.data' && m.payload.terminalId === terminalId))
    
    const initialDataCount = messages.length
    ws.send(JSON.stringify({
      type: 'terminal.input',
      payload: { terminalId, data: 'echo terminal-e2e-working\r' }
    }))

    // Verify terminal output contains our echoed text
    const hasEchoed = await waitFor(() => {
      const dataMsgs = messages.slice(initialDataCount).filter(m => m.type === 'terminal.data' && m.payload.terminalId === terminalId)
      const concatenated = dataMsgs.map(m => m.payload.data).join('')
      return concatenated.includes('terminal-e2e-working')
    })
    expect(hasEchoed).toBe(true)

    // 4. Close the terminal
    ws.send(JSON.stringify({
      type: 'terminal.close',
      payload: { terminalId }
    }))

    const closed = await waitFor(() =>
      messages.find(m => m.type === 'terminal.closed' && m.payload.terminalId === terminalId)
    )
    expect(closed).toBeTruthy()

    ws.close()
  })

  it('should support attaching to an active agent session PTY interactively', async () => {
    const { ws, messages } = await openWs(true)

    // Launch agent session
    const launch = await api('POST', '/api/sessions/launch', { projectId, agentId: 'claude' })
    expect(launch.status).toBe(201)
    sessionId = (await launch.json()).data.id

    // Attach to the active session PTY
    ws.send(JSON.stringify({
      type: 'terminal.attach',
      payload: { sessionId }
    }))

    const attached = await waitFor(() =>
      messages.find(m => m.type === 'terminal.attached' && m.payload.sessionId === sessionId)
    )
    expect(attached).toBeTruthy()
    expect(attached.payload.terminalId).toBe(sessionId)

    // Verify session PTY outputs raw data
    const hasRawData = await waitFor(() =>
      messages.some(m => m.type === 'terminal.data' && m.payload.terminalId === sessionId)
    )
    expect(hasRawData).toBe(true)

    // Stop session
    await api('POST', `/api/sessions/${sessionId}/stop`)
    ws.close()
  })
})
