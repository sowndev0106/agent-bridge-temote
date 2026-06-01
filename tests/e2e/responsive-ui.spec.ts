import { expect, test, type Page } from '@playwright/test'

const ok = (data: unknown) => ({ ok: true, data })

async function mockRemoteBridgeApi(page: Page) {
  let projects = [
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
  ]

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
    body: JSON.stringify(ok(projects))
  }))

  await page.route(/\/api\/projects\/[^/]+$/, route => {
    const method = route.request().method()
    const id = route.request().url().split('/').pop()
    if (method === 'DELETE') {
      projects = projects.filter(project => project.id !== id)
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(ok(null))
      })
    }
    return route.fallback()
  })

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

test('Project sidebar expands to show project details and reorder controls', async ({ page }) => {
  await openDashboard(page)

  const sidebar = page.getByRole('complementary', { name: 'Projects' })
  await expect(sidebar).toBeVisible()
  await page.getByRole('button', { name: 'Expand project sidebar' }).click()

  await expect(sidebar.getByText('api-service', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('/home/user/workplace/personal/api-service')).toBeVisible()
  // Reordering is drag-and-drop; each row carries a remove control.
  await expect(sidebar.getByRole('button', { name: 'Remove api-service' })).toBeAttached()

  await expect.poll(async () => {
    const expandedBox = await sidebar.boundingBox()
    return expandedBox?.width ?? 0
  }).toBeGreaterThan(200)

  await page.getByRole('button', { name: 'Collapse project sidebar' }).click()
  await expect.poll(async () => {
    const collapsedBox = await sidebar.boundingBox()
    return collapsedBox?.width ?? 0
  }).toBeLessThanOrEqual(64)
})

test('Expanded project sidebar can delete an idle project after confirmation', async ({ page }) => {
  await openDashboard(page)
  await page.getByRole('button', { name: 'Expand project sidebar' }).click()

  await page.getByRole('button', { name: 'Remove frontend-dashboard-with-long-name' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete project' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('frontend-dashboard-with-long-name', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Delete project permanently' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete project' })).toBeHidden()
  await expect(page.getByText('frontend-dashboard-with-long-name')).toBeHidden()
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

test('Collapsing Explorer moves Sessions up while open Explorer keeps a fixed region', async ({ page }) => {
  await openDashboard(page)
  await page.route(/\/api\/projects\/[^/]+\/files(\?.*)?$/, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(ok({
      projectId: 'project-api',
      rootPath: '/home/user/workplace/personal/api-service',
      path: '',
      parent: null,
      entries: [
        { name: 'src', path: 'src', type: 'directory', size: null, modifiedAt: '2026-05-29T00:00:00.000Z' },
        { name: 'README.md', path: 'README.md', type: 'file', size: 40, modifiedAt: '2026-05-29T00:00:00.000Z' },
        ...Array.from({ length: 40 }, (_, index) => ({
          name: `fixture-${index.toString().padStart(2, '0')}.ts`,
          path: `fixture-${index.toString().padStart(2, '0')}.ts`,
          type: 'file',
          size: 40,
          modifiedAt: '2026-05-29T00:00:00.000Z'
        }))
      ]
    }))
  }))
  await openProject(page)

  const explorerButton = page.getByRole('button', { name: 'Explorer' })
  const sessionsButton = page.getByRole('button', { name: 'Sessions' })

  await expect(explorerButton).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.rb-filetree').getByText('fixture-39.ts')).toBeVisible()
  await expect.poll(async () => page.locator('#explorer-section > .rb-scrollbar').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  const openTop = await sessionsButton.evaluate(element => element.getBoundingClientRect().top)

  await explorerButton.click()
  await expect(explorerButton).toHaveAttribute('aria-expanded', 'false')
  const collapsedTop = await sessionsButton.evaluate(element => element.getBoundingClientRect().top)
  expect(collapsedTop).toBeLessThan(openTop)

  await explorerButton.click()
  await expect(explorerButton).toHaveAttribute('aria-expanded', 'true')
  const reopenedTop = await sessionsButton.evaluate(element => element.getBoundingClientRect().top)
  expect(Math.abs(reopenedTop - openTop)).toBeLessThanOrEqual(2)
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
