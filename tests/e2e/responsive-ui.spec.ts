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
      content: '# README\n\nHello from the file editor.\n',
      truncated: false,
      size: 38
    }))
  }))
}

async function openDashboard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockRemoteBridgeApi(page)
  await page.goto('/')
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByText('Recent projects')).toBeVisible()
}

async function openProject(page: Page) {
  await page.getByRole('link', { name: 'api-service' }).first().click()
  // Explorer lazily lists the project root.
  await expect(page.locator('.rb-filetree').getByText('README.md')).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    doc: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }))
  expect(Math.max(metrics.body, metrics.doc)).toBeLessThanOrEqual(metrics.viewport + 1)
}

test('VS Code shell: title bar, activity bar and exposure warning', async ({ page }) => {
  await openDashboard(page)
  await expectNoHorizontalOverflow(page)

  // Title bar brand + exposure warning (moved out of the old Header).
  await expect(page.getByRole('banner').getByText('RemoteBridge')).toBeVisible()
  await expect(page.getByText('RemoteBridge is exposed on 0.0.0.0')).toBeVisible()

  // Activity bar rail with one avatar link per project.
  const activityBar = page.getByRole('complementary', { name: 'Projects' })
  await expect(activityBar).toBeVisible()
  const rail = await activityBar.boundingBox()
  expect(rail).not.toBeNull()
  expect(rail!.width).toBeLessThanOrEqual(64)
})

test('Primary sidebar: explorer, sessions and terminal control', async ({ page }) => {
  await openDashboard(page)
  await openProject(page)

  // EXPLORER lists project root entries.
  await expect(page.locator('.rb-filetree').getByText('src')).toBeVisible()
  await expect(page.locator('.rb-filetree').getByText('README.md')).toBeVisible()

  // Sessions render (sidebar list + pinned editor-area panel both reuse SessionRow).
  await expect(page.locator('[data-testid="session-row"]').first()).toBeVisible()
  expect(await page.locator('[data-testid="session-row"]').count()).toBeGreaterThanOrEqual(3)

  // Terminal dock collapsed bar and the "New session" action are present.
  await expect(page.getByRole('button', { name: 'Open new terminal' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New session' })).toBeVisible()

  await expectNoHorizontalOverflow(page)
})

test('Opening a file mounts a Monaco editor tab', async ({ page }) => {
  await openDashboard(page)
  await openProject(page)

  // react-complex-tree opens a file on primary action (double click).
  await page.locator('.rb-filetree').getByText('README.md').dblclick()

  // A dockview editor tab and the Monaco editor appear.
  await expect(page.locator('.dockview-theme-rb').getByText('README.md').first()).toBeVisible()
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 })
})
