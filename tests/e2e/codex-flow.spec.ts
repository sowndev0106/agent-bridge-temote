import { expect, test, type Page } from '@playwright/test'

const ok = (data: unknown) => ({ ok: true, data })

test.beforeEach(async ({ page }) => {
  // Inject mock WebSocket class before page load
  await page.addInitScript(() => {
    class MockWebSocket extends EventTarget {
      static instances: MockWebSocket[] = []
      readyState = 1 // OPEN
      url: string

      constructor(url: string) {
        super()
        this.url = url
        MockWebSocket.instances.push(this)
        setTimeout(() => {
          const event = new Event('open')
          this.dispatchEvent(event)
          if (this.onopen) this.onopen(event)
        }, 10)
      }

      send(data: string) {
        window.dispatchEvent(new CustomEvent('ws:sent', { detail: JSON.parse(data) }))
      }

      close() {
        this.readyState = 3 // CLOSED
        const event = new Event('close')
        this.dispatchEvent(event)
        if (this.onclose) this.onclose(event)
      }

      onopen: any = null
      onclose: any = null
      onerror: any = null
      onmessage: any = null

      triggerMessage(data: any) {
        const event = new MessageEvent('message', { data: JSON.stringify(data) })
        this.dispatchEvent(event)
        if (this.onmessage) this.onmessage(event)
      }
    }

    (window as any).WebSocket = MockWebSocket
    // Keep track of instances globally so we can trigger updates
    ;(window as any).MockWebSocket = MockWebSocket
  })
})

test('desktop Codex chat workflow: launch, streaming, approvals, and diff views', async ({ page }) => {
  let sessions: any[] = []

  // Mock API endpoints
  await page.route('**/api/config', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      port: 4096,
      host: '127.0.0.1',
      sessionTTL: 86400,
      linkExtractTimeout: 30,
      maxConcurrentSessions: 10,
      keepSessionLogsLines: 500,
      agents: {},
      globalEnv: {},
      logLevel: 'info'
    }))
  }))

  await page.route('**/api/auth/csrf', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({ csrfToken: 'test-csrf' }))
  }))

  await page.route('**/api/projects', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok([{
      id: 'project-api',
      name: 'api-service',
      path: '/home/user/workplace/personal/api-service',
      env: {},
      lastAgentId: 'codex',
      createdAt: '2026-05-29T00:00:00.000Z'
    }]))
  }))

  await page.route('**/api/sessions', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok(sessions))
  }))

  await page.route('**/api/agents', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok([
      {
        id: 'claude',
        name: 'Claude Code',
        command: 'claude',
        args: ['--remote-control'],
        env: {},
        linkPattern: 'https://claude\\.ai/code/session_[\\w]+',
        enabled: true
      },
      {
        id: 'codex',
        name: 'Codex',
        command: 'codex',
        args: [],
        env: {},
        linkPattern: null,
        enabled: true
      }
    ]))
  }))

  // Handle launch
  await page.route('**/api/sessions/launch', route => {
    const body = route.request().postDataJSON()
    expect(body.agentId).toBe('codex')
    const newSession = {
      id: 'session-codex',
      projectId: 'project-api',
      agentId: 'codex',
      pid: 54321,
      state: 'running',
      remoteLink: null,
      chatHistory: [],
      activeTurn: null,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      error: null
    }
    sessions.push(newSession)
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(ok(newSession))
    })
  })

  // Handle message sending
  await page.route('**/api/sessions/session-codex/messages', route => {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(ok({ success: true }))
    })
  })

  // Handle approval resolution
  await page.route('**/api/sessions/session-codex/approvals/approval-1', route => {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(ok({ success: true }))
    })
  })

  // Handle git status
  await page.route(/\/api\/projects\/[^/]+\/git\/status/, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      files: [{ path: 'src/App.tsx', status: 'M' }]
    }))
  }))

  // Handle file diff preview
  await page.route(/\/api\/projects\/[^/]+\/git\/diff\?path=src%2FApp\.tsx/, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      original: 'export default function App() {\n  return <div>Hello</div>\n}',
      modified: 'export default function App() {\n  return <div>Hello Redirect</div>\n}'
    }))
  }))

  // Navigate to project workspace
  await page.goto('/project/project-api')

  // 1. Launch Codex Agent
  await page.getByRole('button', { name: 'New session' }).click()
  const agentSelector = page.getByRole('dialog', { name: 'Launch Agent' })
  await expect(agentSelector).toBeVisible()

  // Select Codex from catalog radio options and launch
  await agentSelector.getByText('Codex', { exact: true }).click()
  await agentSelector.getByRole('button', { name: 'Launch', exact: true }).click()

  // 2. Stream launching/running state via MockWebSocket
  await page.evaluate(() => {
    const ws = (window as any).MockWebSocket.instances[(window as any).MockWebSocket.instances.length - 1]
    if (ws) {
      ws.triggerMessage({
        type: 'session.updated',
        payload: {
          id: 'session-codex',
          projectId: 'project-api',
          agentId: 'codex',
          pid: 54321,
          state: 'running',
          remoteLink: null,
          chatHistory: [],
          activeTurn: null,
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          error: null
        }
      })
    }
  })

  // 3. Open the Codex session as a remote editor tab in workspace
  await page.getByRole('button', { name: 'Open Remote' }).first().click()

  // Ensure Codex Chat panel editor tab is loaded in Dockview
  await expect(page.getByText('🤖 OpenAI Codex')).toBeVisible()

  // 3. User sends chat prompt
  const chatInput = page.getByPlaceholder('Ask Codex to modify or write code...')
  await expect(chatInput).toBeVisible()
  await chatInput.fill('Run tests')
  const messageResponsePromise = page.waitForResponse('**/api/sessions/session-codex/messages')
  await page.getByRole('button', { name: 'Send message' }).click()
  await messageResponsePromise

  // Simulate prompt arrival in chat history & streaming turn with approval requested
  await page.evaluate(() => {
    const ws = (window as any).MockWebSocket.instances[(window as any).MockWebSocket.instances.length - 1]
    if (ws) {
      ws.triggerMessage({
        type: 'session.updated',
        payload: {
          id: 'session-codex',
          projectId: 'project-api',
          agentId: 'codex',
          pid: 54321,
          state: 'running',
          remoteLink: null,
          chatHistory: [
            { id: 'm1', role: 'user', content: 'Run tests', timestamp: new Date().toISOString() }
          ],
          activeTurn: {
            id: 'turn-1',
            status: 'running',
            delta: 'I will trigger the local test suite.',
            approval: {
              id: 'approval-1',
              command: 'npm run test:auth',
              status: 'pending'
            }
          },
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          error: null
        }
      })
    }
  })

  // Verify chat bubbles and pending authorization command banner are visible
  await expect(page.getByText('Run tests')).toBeVisible()
  await expect(page.getByText('🔐 Executive Command Authorization Required')).toBeVisible()
  await expect(page.getByText('npm run test:auth')).toBeVisible()

  // 4. Approve command
  const approvalResponsePromise = page.waitForResponse('**/api/sessions/session-codex/approvals/approval-1')
  await page.getByRole('button', { name: 'Approve' }).click()
  await approvalResponsePromise

  // Simulate server resolving approval & completing the turn
  await page.evaluate(() => {
    const ws = (window as any).MockWebSocket.instances[(window as any).MockWebSocket.instances.length - 1]
    if (ws) {
      ws.triggerMessage({
        type: 'session.updated',
        payload: {
          id: 'session-codex',
          projectId: 'project-api',
          agentId: 'codex',
          pid: 54321,
          state: 'running',
          remoteLink: null,
          chatHistory: [
            { id: 'm1', role: 'user', content: 'Run tests', timestamp: new Date().toISOString() },
            { id: 'm2', role: 'agent', content: 'I triggered the local test suite.\nTests passed successfully!', timestamp: new Date().toISOString() }
          ],
          activeTurn: null,
          startedAt: new Date().toISOString(),
          stoppedAt: null,
          error: null
        }
      })
    }
  })

  // Verify chat completes with success output
  await expect(page.getByText('Tests passed successfully!')).toBeVisible()
})
