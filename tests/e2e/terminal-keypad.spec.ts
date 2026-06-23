import { expect, test, type Page } from '@playwright/test'

const ok = (data: unknown) => ({ ok: true, data })

// Re-uses the mock pattern from responsive-ui.spec.ts + codex-flow.spec.ts:
//  - page.route mocks HTTP endpoints the SPA fetches on load
//  - page.addInitScript replaces window.WebSocket with a fake that:
//      - dispatches 'open' on connect
//      - auto-fulfils terminal.create by faking a terminal.created message
//      - records all sent messages on window.__wsSent
async function mockRemoteBridgeApi(page: Page) {
  await page.route('**/api/config', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      port: 4096,
      host: '0.0.0.0',
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
      lastAgentId: 'claude',
      createdAt: '2026-05-29T00:00:00.000Z'
    }]))
  }))

  await page.route('**/api/sessions', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok([]))
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
      }
    ]))
  }))
}

// Install a fake WebSocket that:
//  - dispatches 'open' immediately
//  - records every message sent via ws.send() on (window as any).__wsSent
//  - when receiving terminal.create, dispatches a synthetic terminal.created
//    so the SPA mounts the TerminalTab (and MobileKeypad)
async function installMockWebSocket(page: Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__wsSent = [] as Array<{ type: string; payload: any }>

    class MockWebSocket extends EventTarget {
      readyState = 1 // OPEN
      url: string
      onopen: any = null
      onclose: any = null
      onerror: any = null
      onmessage: any = null

      constructor(url: string) {
        super()
        this.url = url
        setTimeout(() => {
          const event = new Event('open')
          this.dispatchEvent(event)
          if (this.onopen) this.onopen(event)
        }, 5)
      }

      send(data: string) {
        try {
          const parsed = JSON.parse(data)
          w.__wsSent.push(parsed)
          // Faked server: on terminal.create, send terminal.created back
          if (parsed.type === 'terminal.create') {
            const terminalId = 'mock-term-' + Math.random().toString(36).slice(2, 8)
            const reply = {
              type: 'terminal.created',
              payload: {
                terminalId,
                title: 'mock-shell',
                pid: 12345,
                projectId: parsed.payload?.projectId ?? null
              }
            }
            setTimeout(() => {
              const ev = new MessageEvent('message', { data: JSON.stringify(reply) })
              this.dispatchEvent(ev)
              if (this.onmessage) this.onmessage(ev)
            }, 10)
          }
        } catch {
          /* ignore non-JSON */
        }
      }

      close() {
        this.readyState = 3
        const event = new Event('close')
        this.dispatchEvent(event)
        if (this.onclose) this.onclose(event)
      }
    }

    ;(window as any).WebSocket = MockWebSocket
  })
}

test.describe('Mobile terminal keypad integration', () => {
  // The keypad is only rendered below 640px wide.
  test.use({ viewport: { width: 390, height: 844 } })

  test('keypad renders when a terminal tab is active', async ({ page }) => {
    test.setTimeout(60_000)
    await installMockWebSocket(page)
    await mockRemoteBridgeApi(page)
    await page.goto('/')

    // Open the project so the TerminalPanel renders.
    await page.getByRole('link', { name: 'api-service' }).first().click()

    // Click the "Open new terminal" button. The mock WS auto-fakes
    // terminal.created so a TerminalTab mounts with isActive=true.
    await page.getByRole('button', { name: 'Open new terminal' }).first().click()

    // Keypad should be in the DOM on mobile.
    await expect(page.getByTestId('mobile-keypad')).toHaveCount(1)
    // Compact bar default controls are present.
    await expect(page.getByTestId('keypad-toggle')).toBeVisible()
    await expect(page.getByTestId('mod-ctrl')).toBeVisible()
    await expect(page.getByTestId('mod-alt')).toBeVisible()
    await expect(page.getByTestId('mod-shift')).toBeVisible()
    await expect(page.getByTestId('keypad-esc')).toBeVisible()
    await expect(page.getByTestId('keypad-tab')).toBeVisible()
    await expect(page.getByTestId('keypad-enter')).toBeVisible()
  })

  test('tapping ↑ sends an arrow escape sequence over WS', async ({ page }) => {
    test.setTimeout(60_000)
    await installMockWebSocket(page)
    await mockRemoteBridgeApi(page)
    await page.goto('/')
    await page.getByRole('link', { name: 'api-service' }).first().click()
    await page.getByRole('button', { name: 'Open new terminal' }).first().click()

    // Wait for terminal.input readiness — the WS handshake auto-resolves via
    // our mock, so after a tick xterm.onData + sendWsMessage are wired up.
    await expect(page.getByTestId('mobile-keypad')).toHaveCount(1)

    // Tap ↑ in the compact bar.
    await page.locator('[data-testid="mobile-keypad"] button', { hasText: '↑' }).first().click()

    // The keypad should have sent a terminal.input with the up-arrow escape.
    await expect.poll(async () => {
      const sent = await page.evaluate(() => (window as any).__wsSent as Array<{ type: string; payload: any }>)
      return sent.some(m => m.type === 'terminal.input' && typeof m.payload?.data === 'string' && m.payload.data.includes('\x1b[A'))
    }, { timeout: 5_000 }).toBe(true)
  })

  test('Ctrl+C armed then quick-c sends 0x03 and disarms', async ({ page }) => {
    test.setTimeout(60_000)
    await installMockWebSocket(page)
    await mockRemoteBridgeApi(page)
    await page.goto('/')
    await page.getByRole('link', { name: 'api-service' }).first().click()
    await page.getByRole('button', { name: 'Open new terminal' }).first().click()
    await expect(page.getByTestId('mobile-keypad')).toHaveCount(1)

    // Tap Ctrl modifier (arms it) — should be visually highlighted.
    await page.getByTestId('mod-ctrl').click()
    // Quick-c appears in the armed row.
    await page.getByTestId('quick-c').click()

    await expect.poll(async () => {
      const sent = await page.evaluate(() => (window as any).__wsSent as Array<{ type: string; payload: any }>)
      return sent.some(m => m.type === 'terminal.input' && m.payload?.data === '\x03')
    }, { timeout: 5_000 }).toBe(true)
  })

  test('keypad stays hidden on desktop viewport', async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await installMockWebSocket(page)
    await mockRemoteBridgeApi(page)
    await page.goto('/')
    await page.getByRole('link', { name: 'api-service' }).first().click()
    await page.getByRole('button', { name: 'Open new terminal' }).first().click()

    // Give React a tick to mount TerminalTab and run the media-query effect.
    await page.waitForTimeout(300)

    // On desktop the keypad renders null — count is 0.
    expect(await page.locator('[data-testid="mobile-keypad"]').count()).toBe(0)
  })
})
