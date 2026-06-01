import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'fs/promises'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { WebSocket } from 'ws'
import { hashPassword, generateSecret } from '../../src/server/core/auth.js'
import { createServer } from '../../src/server/index.js'
import type { AppConfig } from '../../src/types.js'

// End-to-end: a real Fastify server + real node-pty spawn of a fake agent that prints a
// Claude-style remote link, driven over real HTTP and a real WebSocket. HOME is the test
// sandbox (tests/setup.ts), so config/projects/sessions land under os.tmpdir().

const FAKE_AGENT = fileURLToPath(new URL('../fixtures/fake-agent.mjs', import.meta.url))
const PASSWORD = 'e2e-pass-123'

let baseUrl: string
let wsUrl: string
let server: Awaited<ReturnType<typeof createServer>>
let projectDir: string

// session state shared across ordered steps
let cookie = ''
let csrf = ''
let projectId = ''
let sessionId = ''

function setCookieToHeader(res: Response): string {
  // Combine Set-Cookie name=value pairs into a single Cookie request header.
  const cookies = (res.headers as any).getSetCookie?.() ?? []
  return cookies.map((c: string) => c.split(';')[0]).join('; ')
}

async function api(method: string, path: string, body?: unknown, withCsrf = true) {
  const headers: Record<string, string> = {}
  // Only declare a JSON content-type when there's actually a body — Fastify rejects an
  // empty body with content-type application/json (400). stop/restart send no body.
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers['cookie'] = cookie
  if (withCsrf && csrf) headers['x-csrf-token'] = csrf
  return fetch(`${baseUrl}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
}

/** Open a WS, collect parsed messages; resolves the socket once open (or rejects on auth fail). */
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
    const v = await fn()   // await so async predicates resolve before the truthiness check
    if (v !== undefined && v !== false) return v as T
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise(r => setTimeout(r, stepMs))
  }
}

beforeAll(async () => {
  // sanity: setup.ts redirected HOME into the sandbox
  expect(homedir().startsWith(tmpdir())).toBe(true)

  projectDir = await mkdtemp(join(tmpdir(), 'rb-e2e-proj-'))

  // Write a config that overrides the claude agent to our fake PTY agent (ADR-0003: the
  // user may set agents.*.command). linkPattern stays the verified Claude default.
  const config: AppConfig = {
    // port here only feeds the standalone launcher (unused in this test — we listen on an
    // ephemeral port below). It must still pass validateConfig, so keep it in range.
    port: 4099, host: '127.0.0.1',
    password: await hashPassword(PASSWORD),
    sessionSecret: generateSecret(),
    sessionTTL: 3600, linkExtractTimeout: 10, maxConcurrentSessions: 10,
    keepSessionLogsLines: 500,
    agents: { claude: { command: process.execPath, args: [FAKE_AGENT] } },
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

describe('E2E full flow', () => {
  it('H5: unauthenticated API access is rejected', async () => {
    const res = await api('GET', '/api/projects', undefined, false)
    expect(res.status).toBe(401)
  })

  it('rejects a wrong password', async () => {
    const res = await api('POST', '/api/auth/login', { password: 'wrong' }, false)
    expect(res.status).toBe(401)
  })

  it('logs in, issuing session cookie + CSRF token', async () => {
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

  it('H7: GET /api/config never leaks password or sessionSecret', async () => {
    const res = await api('GET', '/api/config')
    const j = await res.json()
    expect(res.status).toBe(200)
    expect('password' in j.data).toBe(false)
    expect('sessionSecret' in j.data).toBe(false)
  })

  it('H6: project mutation without CSRF token is rejected', async () => {
    const res = await api('POST', '/api/projects', { name: 'NoCsrf', path: projectDir }, false)
    expect(res.status).toBe(403)
  })

  it('H9: rejects a non-existent project path', async () => {
    const res = await api('POST', '/api/projects', { name: 'Bad', path: '/no/such/dir/xyz' })
    expect(res.status).toBe(400)
  })

  it('creates a project (with CSRF)', async () => {
    const res = await api('POST', '/api/projects', { name: 'E2E', path: projectDir })
    expect(res.status).toBe(201)
    projectId = (await res.json()).data.id
    expect(projectId).toBeTruthy()
  })

  it('H5: WebSocket upgrade without a session cookie is rejected', async () => {
    await expect(openWs(false)).rejects.toBeTruthy()
  })

  it('FR4: launches claude and extracts the remote link, broadcast over WebSocket', async () => {
    const { ws, messages } = await openWs(true)

    const launch = await api('POST', '/api/sessions/launch', { projectId, agentId: 'claude' })
    expect(launch.status).toBe(201)
    const launched = (await launch.json()).data
    sessionId = launched.id
    expect(launched.state).toBe('launching')

    // The fake agent prints the link ~150ms after spawn; wait for the running update.
    const running = await waitFor(() =>
      messages.find(m => m.type === 'session.updated' && m.payload.id === sessionId && m.payload.state === 'running')
    )
    expect(running.payload.remoteLink).toMatch(/^https:\/\/claude\.ai\/code\/session_[\w]+$/)
    // invariant: session.updated carries no logs array
    expect('logs' in running.payload).toBe(false)
    // logs arrive via their own event
    expect(messages.some(m => m.type === 'session.log')).toBe(true)

    ws.close()
  })

  it('H15: cannot delete a project while it has a live session', async () => {
    const res = await api('DELETE', `/api/projects/${projectId}`)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('project_in_use')
  })

  it('FR5: stops the session', async () => {
    const res = await api('POST', `/api/sessions/${sessionId}/stop`)
    expect(res.status).toBe(200)
    const stopped = await waitFor(async () => {
      const list = await (await api('GET', '/api/sessions')).json()
      const s = list.data.find((x: any) => x.id === sessionId)
      return s && s.state === 'stopped' ? s : undefined
    })
    expect(stopped.state).toBe('stopped')
  })

  it('FR5: restarts the stopped session back to running', async () => {
    const res = await api('POST', `/api/sessions/${sessionId}/restart`)
    expect(res.status).toBe(200)
    const running = await waitFor(async () => {
      const list = await (await api('GET', '/api/sessions')).json()
      const s = list.data.find((x: any) => x.id === sessionId)
      return s && s.state === 'running' ? s : undefined
    })
    expect(running.remoteLink).toMatch(/session_/)
  })

  it('FR5: stop then delete the session record', async () => {
    await api('POST', `/api/sessions/${sessionId}/stop`)
    await waitFor(async () => {
      const list = await (await api('GET', '/api/sessions')).json()
      const s = list.data.find((x: any) => x.id === sessionId)
      return s && s.state === 'stopped' ? s : undefined
    })
    const del = await api('DELETE', `/api/sessions/${sessionId}`)
    expect(del.status).toBe(200)
    const list = await (await api('GET', '/api/sessions')).json()
    expect(list.data.find((x: any) => x.id === sessionId)).toBeUndefined()
  })

  it('H15 cleared: project can be deleted once no sessions are live', async () => {
    const res = await api('DELETE', `/api/projects/${projectId}`)
    expect(res.status).toBe(200)
  })
})
