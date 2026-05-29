import { expect, test, type Page } from '@playwright/test'

const ok = (data: unknown) => ({ ok: true, data })

async function mockBaseApi(page: Page) {
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
    body: JSON.stringify(ok([{
      id: 'claude',
      name: 'Claude Code',
      command: 'claude',
      args: ['--remote-control'],
      env: {},
      linkPattern: 'https://claude\\.ai/code/session_[\\w]+',
      enabled: true
    }]))
  }))
}

async function mockFiles(page: Page) {
  let readmeContent = '# RemoteBridge\n\nA local agent control surface.'

  await page.route(/\/api\/projects\/project-api\/files(\?.*)?$/, route => {
    const method = route.request().method()
    if (method === 'PUT') {
      const body = route.request().postDataJSON()
      if (body && typeof body.content === 'string') {
        readmeContent = body.content
      }
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(ok({ success: true }))
      })
    }

    const url = new URL(route.request().url())
    const path = url.searchParams.get('path') ?? ''
    if (path === 'src') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(ok({
          projectId: 'project-api',
          rootPath: '/home/user/workplace/personal/api-service',
          path: 'src',
          parent: '',
          entries: [
            { name: 'App.tsx', path: 'src/App.tsx', type: 'file', size: 64, modifiedAt: '2026-05-29T00:00:00.000Z' },
            { name: 'server.ts', path: 'src/server.ts', type: 'file', size: 86, modifiedAt: '2026-05-29T00:00:00.000Z' }
          ]
        }))
      })
    }
    return route.fulfill({
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
    })
  })

  await page.route(/\/api\/projects\/project-api\/files\/preview(\?.*)?$/, route => {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(ok({
        projectId: 'project-api',
        path: 'README.md',
        type: 'text',
        content: readmeContent,
        truncated: false,
        size: readmeContent.length
      }))
    })
  })
}

async function openProject(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await mockBaseApi(page)
  await mockFiles(page)
  await page.goto('/project/project-api')
  await expect(page.getByRole('heading', { name: 'api-service' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'File explorer' })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    doc: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }))
  expect(Math.max(metrics.body, metrics.doc)).toBeLessThanOrEqual(metrics.viewport + 1)
}

test('desktop file explorer drills into folders, previews, and edits files', async ({ page }) => {
  await openProject(page, 1280, 800)
  await expectNoHorizontalOverflow(page)

  const explorer = page.getByRole('region', { name: 'File explorer' })
  await expect(explorer.getByRole('button', { name: /src/ })).toBeVisible()
  await explorer.getByRole('button', { name: /README.md/ }).click()
  await expect(explorer.locator('textarea')).toBeVisible()
  await expect(explorer.locator('textarea')).toHaveValue('# RemoteBridge\n\nA local agent control surface.')

  // Edit file
  const textarea = explorer.locator('textarea')
  await textarea.fill('# RemoteBridge - Modified\n\nNew description.')
  
  // Click save
  const saveBtn = explorer.getByRole('button', { name: 'Save' })
  await expect(saveBtn).toBeEnabled()
  await saveBtn.click()
  
  // Verify button becomes disabled after save (indicating it's no longer dirty)
  await expect(saveBtn).toBeDisabled()

  // Verify navigation to sub-folder
  await explorer.getByRole('button', { name: /src/ }).click()
  await expect(explorer.getByRole('button', { name: /App.tsx/ })).toBeVisible()
  await expect(explorer.getByRole('button', { name: /api-service/ })).toBeVisible()
})

test('mobile file explorer stacks cleanly without overflow', async ({ page }) => {
  await openProject(page, 375, 667)
  await expectNoHorizontalOverflow(page)

  const explorer = page.getByRole('region', { name: 'File explorer' })
  const box = await explorer.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.round(box!.width)).toBeLessThanOrEqual(375)

  await explorer.getByRole('button', { name: /README.md/ }).click()
  await expect(explorer.locator('textarea')).toHaveValue('# RemoteBridge\n\nA local agent control surface.')
  await expectNoHorizontalOverflow(page)
})
