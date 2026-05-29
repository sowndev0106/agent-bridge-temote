import { expect, test, type Page } from '@playwright/test'

const ok = (data: unknown) => ({ ok: true, data })

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
    body: JSON.stringify(ok([
      {
        id: 'project-api',
        name: 'api-service',
        path: '/home/user/workplace/personal/api-service',
        env: {},
        lastAgentId: 'claude',
        createdAt: '2026-05-29T00:00:00.000Z'
      },
      {
        id: 'project-web',
        name: 'frontend-dashboard-with-long-name',
        path: '/home/user/workplace/personal/frontend-dashboard-with-long-name',
        env: {},
        lastAgentId: 'claude',
        createdAt: '2026-05-29T00:00:00.000Z'
      }
    ]))
  }))

  await page.route('**/api/sessions', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok([
      {
        id: 'session-running',
        projectId: 'project-api',
        agentId: 'claude',
        pid: 12345,
        state: 'running',
        remoteLink: 'https://claude.ai/code/session_01HX0000000000000000000000',
        logs: ['launching claude', 'remote-control is active at https://claude.ai/code/session_01HX0000000000000000000000'],
        startedAt: '2026-05-29T00:00:00.000Z',
        stoppedAt: null,
        error: null
      },
      {
        id: 'session-launching',
        projectId: 'project-api',
        agentId: 'claude',
        pid: 12346,
        state: 'launching',
        remoteLink: null,
        logs: ['waiting for remote link'],
        startedAt: '2026-05-29T00:00:00.000Z',
        stoppedAt: null,
        error: null
      },
      {
        id: 'session-failed',
        projectId: 'project-api',
        agentId: 'claude',
        pid: null,
        state: 'failed',
        remoteLink: null,
        logs: ['No link found after 30s'],
        startedAt: '2026-05-29T00:00:00.000Z',
        stoppedAt: '2026-05-29T00:00:30.000Z',
        error: 'No link found after 30s'
      }
    ]))
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
        id: 'gemini',
        name: 'Gemini CLI',
        command: 'gemini',
        args: [],
        env: {},
        linkPattern: 'https?://[^\\s]+',
        enabled: false
      }
    ]))
  }))

  await page.route(/\/api\/projects\/[^/]+\/files(\?.*)?$/, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      projectId: 'project-api',
      rootPath: '/home/user/workplace/personal/api-service',
      path: '',
      parent: null,
      entries: [
        { name: 'src', path: 'src', type: 'directory', size: null, modifiedAt: '2026-05-29T00:00:00.000Z' },
        { name: 'README.md', path: 'README.md', type: 'file', size: 40, modifiedAt: '2026-05-29T00:00:00.000Z' }
      ]
    }))
  }))

  await page.route(/\/api\/projects\/[^/]+\/files\/preview(\?.*)?$/, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      projectId: 'project-api',
      path: 'README.md',
      type: 'text',
      content: '# README\n',
      truncated: false,
      size: 8
    }))
  }))
}

async function openDashboard(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await mockRemoteBridgeApi(page)
  await page.goto('/')
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByText('Recent projects')).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    doc: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }))
  expect(Math.max(metrics.body, metrics.doc)).toBeLessThanOrEqual(metrics.viewport + 1)
}

test('mobile layout fits and opens project drawer', async ({ page }) => {
  await openDashboard(page, 375, 667)
  await expectNoHorizontalOverflow(page)

  await expect(page.getByRole('button', { name: 'Open project navigation' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Projects' })).toBeHidden()

  await page.getByRole('button', { name: 'Open project navigation' }).click()
  const projectNavigation = page.getByRole('complementary', { name: 'Projects' })
  await expect(projectNavigation).toBeVisible()
  await expect(projectNavigation.getByText('/home/user/workplace/personal/frontend-dashboard-with-long-name')).toBeVisible()
  await projectNavigation.getByRole('button', { name: 'Close project navigation' }).click()
  await expect(projectNavigation).toBeHidden()

  await page.getByRole('link', { name: 'api-service' }).first().click()
  await expect(page.getByRole('heading', { name: 'api-service' })).toBeVisible()

  const cards = page.locator('[data-testid="session-row"]')
  await expect(cards).toHaveCount(3)
  const first = await cards.first().boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second!.y).toBeGreaterThan(first!.y)

  await page.getByRole('button', { name: 'View logs' }).first().click()
  const drawer = page.getByRole('dialog', { name: /Logs/ })
  await expect(drawer).toBeVisible()
  const box = await drawer.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.round(box!.width)).toBe(375)
  await expectNoHorizontalOverflow(page)
})

test('tablet layout keeps compact navigation and terminal controls usable', async ({ page }) => {
  await openDashboard(page, 768, 1024)
  await expectNoHorizontalOverflow(page)

  const sidebar = page.getByRole('complementary', { name: 'Projects' })
  await expect(sidebar).toBeVisible()
  const sidebarBox = await sidebar.boundingBox()
  expect(sidebarBox).not.toBeNull()
  expect(sidebarBox!.width).toBeGreaterThanOrEqual(56)
  expect(sidebarBox!.width).toBeLessThanOrEqual(240)

  await expect(page.getByRole('button', { name: 'Open new terminal' })).toBeVisible()
})

test('desktop layout uses full sidebar and multi-column sessions', async ({ page }) => {
  await openDashboard(page, 1280, 800)
  await expectNoHorizontalOverflow(page)

  const sidebar = page.getByRole('complementary', { name: 'Projects' })
  const sidebarBox = await sidebar.boundingBox()
  expect(sidebarBox).not.toBeNull()
  expect(sidebarBox!.width).toBeGreaterThanOrEqual(230)

  await page.getByRole('link', { name: 'api-service' }).first().click()
  await expect(page.getByRole('heading', { name: 'api-service' })).toBeVisible()

  const cards = page.locator('[data-testid="session-row"]')
  await expect(cards).toHaveCount(3)
  const first = await cards.first().boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second!.y).toBeGreaterThan(first!.y)

  await expect(page.getByText('RemoteBridge is exposed on 0.0.0.0')).toBeVisible()
})
