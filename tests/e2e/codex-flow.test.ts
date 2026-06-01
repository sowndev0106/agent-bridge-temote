import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'fs/promises'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { WebSocket } from 'ws'
import { hashPassword, generateSecret } from '../../src/server/core/auth.js'
import { createServer } from '../../src/server/index.js'
import type { AppConfig } from '../../src/types.js'

const FAKE_CODEX = fileURLToPath(new URL('../fixtures/fake-codex.mjs', import.meta.url))
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

function openWs(): Promise<{ ws: WebSocket; messages: any[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { cookie } })
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

  projectDir = await mkdtemp(join(tmpdir(), 'rb-e2e-codex-proj-'))

  // Configure Codex to map to our fake-codex mock script
  const config: AppConfig = {
    port: 4101, host: '127.0.0.1',
    password: await hashPassword(PASSWORD),
    sessionSecret: generateSecret(),
    sessionTTL: 3600, linkExtractTimeout: 10, maxConcurrentSessions: 10,
    keepSessionLogsLines: 500,
    agents: { 
      codex: { 
        command: process.execPath, 
        args: [FAKE_CODEX],
        enabled: true
      } 
    },
    globalEnv: {}, logLevel: 'error'
  }
  await mkdir(join(homedir(), '.agent-remote-control'), { recursive: true })
  await writeFile(join(homedir(), '.agent-remote-control', 'config.json'), JSON.stringify(config))

  server = await createServer()
  await server.fastify.listen({ port: 0, host: '127.0.0.1' })
  const addr = server.fastify.server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  baseUrl = `http://127.0.0.1:${port}`
  wsUrl = `ws://127.0.0.1:${port}/ws`
})

afterAll(async () => {
  await server?.manager.killAll()
  await server?.fastify.close()
})

describe('Codex E2E flow', () => {
  it('logs in successfully', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD })
    })
    expect(res.status).toBe(200)
    cookie = setCookieToHeader(res)
    csrf = (await res.json()).data.csrfToken
    expect(cookie).toContain('rb_session=')
    expect(csrf).toBeTruthy()
  })

  it('creates project', async () => {
    const res = await api('POST', '/api/projects', { name: 'E2E-Codex', path: projectDir })
    expect(res.status).toBe(201)
    projectId = (await res.json()).data.id
    expect(projectId).toBeTruthy()
  })

  it('launches a Codex session and transitions to running immediately', async () => {
    const launch = await api('POST', '/api/sessions/launch', { projectId, agentId: 'codex' })
    expect(launch.status).toBe(201)
    const launched = (await launch.json()).data
    sessionId = launched.id
    expect(launched.state).toBe('launching')

    // Since there's no linkPattern required for Codex, it should transition to running instantly
    const running = await waitFor(async () => {
      const list = await (await api('GET', '/api/sessions')).json()
      const s = list.data.find((x: any) => x.id === sessionId)
      return s && s.state === 'running' ? s : undefined
    })
    expect(running.state).toBe('running')
    expect(running.providerSessionId).toBeTruthy() // Created thread successfully
  })

  it('streams messages in real-time and logs events over WebSocket', async () => {
    const { ws, messages } = await openWs()

    const msgRes = await api('POST', `/api/sessions/${sessionId}/messages`, { input: 'hello codex' })
    expect(msgRes.status).toBe(200)

    // Wait for the mock typewriter stream to complete
    const finalHistory = await waitFor(async () => {
      const list = await (await api('GET', '/api/sessions')).json()
      const s = list.data.find((x: any) => x.id === sessionId)
      return s && s.chatHistory && s.chatHistory.some((h: any) => h.role === 'agent') ? s.chatHistory : undefined
    })

    const agentMsg = finalHistory.find((h: any) => h.role === 'agent')
    expect(agentMsg.content).toContain('Hello! I am your Codex assistant running in interactive mock mode.')

    // Verify WebSocket notification streams were received
    expect(messages.some(m => m.type === 'session.updated' && m.payload.activeTurn)).toBe(true)
    expect(messages.some(m => m.type === 'session.log')).toBe(true)

    ws.close()
  })

  it('supports interactive tool approvals', async () => {
    const { ws, messages } = await openWs()

    // Send a message that triggers approval logic in fake-codex
    const msgRes = await api('POST', `/api/sessions/${sessionId}/messages`, { input: 'please run a test for me' })
    expect(msgRes.status).toBe(200)

    // Wait for the approval request to surface in the session state
    const sessionWithApproval = await waitFor(async () => {
      const list = await (await api('GET', '/api/sessions')).json()
      const s = list.data.find((x: any) => x.id === sessionId)
      return s && s.activeTurn && s.activeTurn.approval ? s : undefined
    })

    const approval = sessionWithApproval.activeTurn.approval
    expect(approval.command).toBe('npm run test')
    expect(approval.status).toBe('pending')

    // Send the approval resolution (approve it!)
    const approveRes = await api('POST', `/api/sessions/${sessionId}/approvals/${approval.id}`, { decision: 'approved' })
    expect(approveRes.status).toBe(200)

    // Wait for the stream to complete successfully
    const finalHistory = await waitFor(async () => {
      const list = await (await api('GET', '/api/sessions')).json()
      const s = list.data.find((x: any) => x.id === sessionId)
      // Wait until activeTurn is cleared
      return s && s.activeTurn === null ? s.chatHistory : undefined
    })

    const latestAgentMsg = finalHistory[finalHistory.length - 1]
    expect(latestAgentMsg.content).toContain('You **approved** the approval request')

    ws.close()
  })

  it('stops and deletes the session', async () => {
    const stopRes = await api('POST', `/api/sessions/${sessionId}/stop`)
    expect(stopRes.status).toBe(200)

    const stopped = await waitFor(async () => {
      const list = await (await api('GET', '/api/sessions')).json()
      const s = list.data.find((x: any) => x.id === sessionId)
      return s && s.state === 'stopped' ? s : undefined
    })
    expect(stopped.state).toBe('stopped')

    const delRes = await api('DELETE', `/api/sessions/${sessionId}`)
    expect(delRes.status).toBe(200)
  })
})
