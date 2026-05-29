# Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the RemoteBridge web UI fully responsive across desktop, tablet, and mobile without changing Phase 1 backend behavior.

**Architecture:** Keep the existing React/Zustand structure and improve responsiveness at the shell/component level: `Layout` owns viewport structure, `Header` owns mobile navigation entry points, `Sidebar` becomes desktop rail plus mobile drawer, and each surface uses stable responsive constraints. Add Playwright browser checks that mock API responses at the Vite layer so responsive behavior can be verified without a real backend or agent process.

**Tech Stack:** React 18, Vite, TailwindCSS v3, Zustand, CSS custom properties, Lucide React icons, Playwright, TypeScript.

---

## Scope

This plan is UI-only. Do not change Fastify routes, session spawning, auth semantics, WebSocket auth, or agent lifecycle logic. Phase 1 remains Claude Code only.

The current working tree is dirty and includes terminal feature work (`TerminalPanel`, `TerminalTab`, terminal store/types, WebSocket terminal events). Treat those files as user-owned work. Responsive changes may touch terminal UI files, but must not remove terminal behavior or revert unrelated backend changes.

## Source Documents

Read these before executing:

- `docs/REQUIMENT.md`, especially NFR3 for persistent public-host warnings and the route/auth surface.
- `docs/DESIGN.md`, especially responsive layout sections for desktop, tablet, and mobile.
- `AGENTS.md`, especially frontend styling conventions and the rule to use design tokens instead of raw Tailwind color utilities where practical.

## File Structure

Modify:

- `package.json`: add `lucide-react`, `@playwright/test`, and a `test:responsive` script.
- `src/web/index.css`: add design tokens, base app styles, responsive utility classes, animation keyframes, and xterm fit helpers.
- `src/web/stores/ui.ts`: add mobile sidebar state.
- `src/web/components/Layout.tsx`: make the app shell responsive, support mobile drawer overlay, keep terminal panel below main content.
- `src/web/components/Header.tsx`: replace text/emoji controls with responsive icon buttons, add mobile menu toggle, add persistent public-host warning banner.
- `src/web/components/Sidebar.tsx`: desktop sidebar, tablet compact rail, mobile drawer, stable project rows.
- `src/web/pages/Dashboard.tsx`: responsive panel header, session grid, empty state.
- `src/web/components/SessionCard.tsx`: token-based responsive cards with wrapping action rows and stable button sizes.
- `src/web/components/AddProjectModal.tsx`: mobile-safe modal layout and scroll behavior.
- `src/web/components/AgentSelectorModal.tsx`: mobile-safe modal layout and disabled provider clarity.
- `src/web/components/LogsDrawer.tsx`: full-screen mobile drawer, side drawer on larger screens, non-overlapping action header.
- `src/web/pages/LoginPage.tsx`: responsive login panel and token styling.
- `src/web/pages/SettingsPage.tsx`: one-column mobile settings forms, wider desktop layout.
- `src/web/components/TerminalPanel.tsx`: responsive terminal tray height, scrollable tab bar, icon controls on narrow screens.
- `src/web/components/TerminalTab.tsx`: refit terminal on viewport changes.

Create:

- `playwright.config.ts`: Vite webServer and browser config.
- `tests/e2e/responsive-ui.spec.ts`: desktop, tablet, mobile viewport checks with mocked API responses.

Do not create a new design system directory. The app is small enough to keep this as direct component work plus CSS tokens.

## Responsive Acceptance Criteria

- 375x667 mobile: no horizontal page overflow, header controls fit, sidebar is hidden until opened, sessions render in one column, logs drawer is full width, modals fit inside viewport with internal scroll.
- 768x1024 tablet: compact sidebar rail or narrow sidebar does not overlap content, session grid uses available width, terminal panel controls remain usable.
- 1280x800 desktop: 240px sidebar, multi-column session grid, logs drawer max width, settings page does not stretch full width.
- Public-host warning remains visible in the authenticated UI when `config.host !== "127.0.0.1"`.
- All interactive icon-only controls have `aria-label` and `title`.
- `npm run build`, `npx tsc --noEmit`, and `npm run test:responsive` pass.

---

### Task 1: Responsive Browser Test Harness

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/responsive-ui.spec.ts`

- [ ] **Step 1: Add responsive test dependencies and script**

Modify `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:web\"",
    "dev:server": "node --env-file-if-exists .env ./node_modules/.bin/tsx watch src/server/index.ts",
    "dev:web": "vite",
    "build": "npm run build:server && npm run build:web",
    "build:server": "tsup",
    "build:web": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:responsive": "playwright test tests/e2e/responsive-ui.spec.ts",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@fastify/cookie": "^9.4.0",
    "@fastify/static": "^7.0.4",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-web-links": "^0.12.0",
    "@xterm/xterm": "^6.0.0",
    "bcryptjs": "^2.4.3",
    "commander": "^12.1.0",
    "fastify": "^4.28.1",
    "lucide-react": "^0.468.0",
    "node-pty": "^1.0.0",
    "open": "^10.1.0",
    "pino": "^9.3.2",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.1",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/ws": "^8.5.11",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "concurrently": "^8.2.2",
    "postcss": "^8.4.39",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.0",
    "tailwindcss": "^3.4.4",
    "tsup": "^8.1.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.2",
    "vite": "^5.3.2",
    "vitest": "^1.6.0",
    "zustand": "^4.5.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
npx playwright install chromium
```

Expected: `package-lock.json` updates and Chromium is installed. If Chromium is already installed, Playwright reports that no browser download is needed or exits successfully.

- [ ] **Step 3: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev:web -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
})
```

- [ ] **Step 4: Create `tests/e2e/responsive-ui.spec.ts`**

```ts
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
        projectId: 'project-web',
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
        projectId: 'project-web',
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
}

async function openDashboard(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await mockRemoteBridgeApi(page)
  await page.goto('/')
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByText('Active Sessions')).toBeVisible()
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
  await expect(page.getByRole('complementary', { name: 'Projects' })).toBeVisible()
  await expect(page.getByText('/home/user/workplace/personal/frontend-dashboard-with-long-name')).toBeVisible()

  const cards = page.locator('[data-testid="session-card"]')
  await expect(cards).toHaveCount(3)
  const first = await cards.first().boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second!.y).toBeGreaterThan(first!.y)

  await page.getByRole('button', { name: 'View logs for claude session session-running' }).click()
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
  expect(sidebarBox!.width).toBeLessThanOrEqual(224)

  await expect(page.getByRole('button', { name: 'Open new terminal' })).toBeVisible()
})

test('desktop layout uses full sidebar and multi-column sessions', async ({ page }) => {
  await openDashboard(page, 1280, 800)
  await expectNoHorizontalOverflow(page)

  const sidebar = page.getByRole('complementary', { name: 'Projects' })
  const sidebarBox = await sidebar.boundingBox()
  expect(sidebarBox).not.toBeNull()
  expect(sidebarBox!.width).toBeGreaterThanOrEqual(230)

  const cards = page.locator('[data-testid="session-card"]')
  await expect(cards).toHaveCount(3)
  const first = await cards.first().boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(Math.abs(second!.y - first!.y)).toBeLessThan(24)

  await expect(page.getByText('RemoteBridge is exposed on 0.0.0.0')).toBeVisible()
})
```

- [ ] **Step 5: Run the responsive tests and confirm they fail before implementation**

Run:

```bash
npm run test:responsive
```

Expected: FAIL. The current UI has no `aria-label="Open project navigation"`, no `data-testid="session-card"`, raw responsive shell behavior is missing, and mobile overflow checks may fail.

- [ ] **Step 6: Commit the failing test harness**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e/responsive-ui.spec.ts
git commit -m "test: add responsive ui browser coverage"
```

---

### Task 2: Design Tokens and Base Responsive CSS

**Files:**
- Modify: `src/web/index.css`

- [ ] **Step 1: Replace `src/web/index.css` with token-driven base styles**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg-base: #0b0d12;
  --color-bg-surface: #111318;
  --color-bg-elevated: #181c26;
  --color-bg-overlay: #1e2230;
  --color-bg-hover: #242838;
  --color-border-subtle: #1e2230;
  --color-border-default: #2a3045;
  --color-border-strong: #3a4260;
  --color-text-primary: #e4e8f4;
  --color-text-secondary: #8892a8;
  --color-text-muted: #4e5a72;
  --color-text-code: #a8b8d8;
  --color-accent: #3b82f6;
  --color-accent-dim: #1d3461;
  --color-accent-glow: rgba(59, 130, 246, 0.15);
  --color-running: #22c55e;
  --color-running-dim: #14532d;
  --color-running-glow: rgba(34, 197, 94, 0.12);
  --color-launching: #f59e0b;
  --color-launching-dim: #451a03;
  --color-failed: #ef4444;
  --color-failed-dim: #450a0a;
  --color-stopped: #4e5a72;
  --color-stopped-dim: #1a1f2e;
  --color-warning: #f59e0b;
  --color-warning-bg: rgba(245, 158, 11, 0.08);
  --color-warning-border: rgba(245, 158, 11, 0.25);
  --color-destructive: #ef4444;
  --color-success: #22c55e;
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--color-border-subtle);
  --shadow-modal: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px var(--color-border-default);
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  min-width: 0;
  min-height: 100%;
}

html {
  background: var(--color-bg-base);
}

body {
  margin: 0;
  overflow-x: hidden;
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  letter-spacing: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  touch-action: manipulation;
}

.rb-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.rb-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.rb-scrollbar::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 999px;
}

.rb-focus {
  outline: none;
}

.rb-focus:focus-visible {
  box-shadow: 0 0 0 3px var(--color-accent-glow);
  outline: 1px solid var(--color-accent);
  outline-offset: 1px;
}

.rb-icon-button {
  display: inline-flex;
  min-width: 36px;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.rb-icon-button:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-strong);
  color: var(--color-text-primary);
}

.rb-primary-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-md);
  background: var(--color-accent-dim);
  color: white;
  font-size: 13px;
  font-weight: 600;
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.rb-primary-button:hover {
  background: var(--color-accent);
}

.rb-primary-button:active {
  transform: scale(0.98);
}

.rb-ghost-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.rb-ghost-button:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border-strong);
  color: var(--color-text-primary);
}

.rb-input {
  width: 100%;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-overlay);
  color: var(--color-text-primary);
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
}

.rb-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-glow);
}

.rb-mono {
  font-family: var(--font-mono);
}

.rb-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

@keyframes rb-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--color-running-glow); }
  50% { opacity: 0.65; box-shadow: 0 0 0 5px var(--color-running-glow); }
}

@keyframes rb-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(220%); }
}

.xterm {
  height: 100%;
}

.xterm-screen {
  min-width: 0;
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS. CSS changes do not affect TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/web/index.css
git commit -m "style: add responsive ui design tokens"
```

---

### Task 3: Mobile Sidebar State

**Files:**
- Modify: `src/web/stores/ui.ts`

- [ ] **Step 1: Replace `src/web/stores/ui.ts` with sidebar-aware UI state**

```ts
import { create } from 'zustand'

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  mobileSidebarOpen: boolean
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
  setMobileSidebarOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  logsSessionId: null,
  mobileSidebarOpen: false,
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id, mobileSidebarOpen: false }),
  setLogsSessionId: (id) => set({ logsSessionId: id }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open })
}))
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: FAIL until `Layout`, `Header`, and `Sidebar` are updated if they import state names introduced later. If only this task has been applied, it should PASS because existing callers still use unchanged fields.

- [ ] **Step 3: Commit**

```bash
git add src/web/stores/ui.ts
git commit -m "feat: track mobile sidebar state"
```

---

### Task 4: Responsive App Shell, Header, and Sidebar

**Files:**
- Modify: `src/web/components/Layout.tsx`
- Modify: `src/web/components/Header.tsx`
- Modify: `src/web/components/Sidebar.tsx`

- [ ] **Step 1: Replace `src/web/components/Layout.tsx`**

```tsx
import Header from './Header'
import Sidebar from './Sidebar'
import TerminalPanel from './TerminalPanel'
import { useUIStore } from '../stores/ui'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useUIStore()

  return (
    <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        {mobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close project navigation"
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="rb-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
            {children}
          </main>
          <TerminalPanel />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace `src/web/components/Header.tsx`**

```tsx
import { LogOut, Menu, Settings } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useConfigStore } from '../stores/config'
import { useUIStore } from '../stores/ui'

export default function Header() {
  const { wsConnected, config } = useConfigStore()
  const { setMobileSidebarOpen } = useUIStore()
  const navigate = useNavigate()
  const publicHost = Boolean(config?.host && config.host !== '127.0.0.1')

  const logout = async () => {
    await api.logout().catch(() => {})
    navigate('/login')
  }

  return (
    <div className="shrink-0 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      {publicHost && (
        <div className="flex min-h-10 items-center gap-2 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-text-secondary)] sm:px-4">
          <span className="font-semibold text-[var(--color-warning)]">Warning</span>
          <span className="min-w-0 flex-1 truncate">
            RemoteBridge is exposed on {config?.host}. Ensure your firewall and password are configured.
          </span>
        </div>
      )}
      <header className="flex h-12 items-center justify-between gap-3 px-3 sm:px-4" role="banner">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Open project navigation"
            title="Projects"
            className="rb-icon-button md:hidden"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-dim)] font-mono text-[11px] font-semibold text-[var(--color-accent)]">
              RB
            </span>
            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)] sm:text-[15px]">
              RemoteBridge
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-[var(--color-text-secondary)] xs:flex sm:flex">
            <span
              className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-[var(--color-running)]' : 'bg-[var(--color-stopped)]'}`}
              style={wsConnected ? { animation: 'rb-pulse 3s ease-in-out infinite' } : undefined}
            />
            <span className="hidden sm:inline">{wsConnected ? 'Connected' : 'Disconnected'}</span>
          </span>
          <Link to="/settings" aria-label="Open settings" title="Settings" className="rb-icon-button">
            <Settings size={17} />
          </Link>
          <button type="button" onClick={logout} aria-label="Logout" title="Logout" className="rb-icon-button">
            <LogOut size={17} />
          </button>
        </div>
      </header>
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/web/components/Sidebar.tsx`**

```tsx
import { Plus, Play } from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'

export default function Sidebar() {
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const { mobileSidebarOpen, setAddProjectOpen, setAgentSelectorProjectId, setMobileSidebarOpen } = useUIStore()

  const content = (
    <>
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-3 lg:px-4">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)] md:hidden lg:block">
          Projects
        </p>
        <button
          type="button"
          aria-label="Add project"
          title="Add project"
          onClick={() => setAddProjectOpen(true)}
          className="rb-icon-button ml-auto h-8 min-h-8 min-w-8"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="rb-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {projects.map(project => {
          const active = sessions.some(session => session.projectId === project.id && (session.state === 'launching' || session.state === 'running'))
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setAgentSelectorProjectId(project.id)}
              title={`${project.name}\n${project.path}`}
              className={`group grid w-full min-w-0 grid-cols-[1fr_auto] gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors lg:px-3 ${
                active
                  ? 'border-l-[3px] border-l-[var(--color-running)] border-y-[var(--color-border-subtle)] border-r-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]'
                  : 'border-transparent hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)]'
              }`}
            >
              <span className="min-w-0 md:hidden lg:block">
                <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{project.name}</span>
                <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{project.path}</span>
              </span>
              <span className="hidden h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-overlay)] text-xs font-semibold text-[var(--color-text-code)] md:flex lg:hidden">
                {project.name.slice(0, 2).toUpperCase()}
              </span>
              <Play size={14} className="mt-0.5 shrink-0 text-[var(--color-accent)] md:hidden lg:block" />
            </button>
          )
        })}
      </div>
    </>
  )

  return (
    <>
      <aside
        aria-label="Projects"
        className="rb-scrollbar hidden w-14 shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] md:flex lg:w-60"
      >
        {content}
      </aside>
      <aside
        aria-label="Projects"
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(84vw,320px)] flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl transition-transform duration-200 md:hidden ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!mobileSidebarOpen}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Projects</span>
          <button
            type="button"
            aria-label="Close project navigation"
            title="Close"
            className="rb-icon-button"
            onClick={() => setMobileSidebarOpen(false)}
          >
            x
          </button>
        </div>
        {content}
      </aside>
    </>
  )
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS. If TypeScript cannot resolve `lucide-react`, rerun `npm install` from Task 1.

- [ ] **Step 5: Run responsive tests**

Run:

```bash
npm run test:responsive
```

Expected: still FAIL because session card test IDs and drawer behavior are not implemented yet, but header/sidebar assertions should now pass.

- [ ] **Step 6: Commit**

```bash
git add src/web/components/Layout.tsx src/web/components/Header.tsx src/web/components/Sidebar.tsx src/web/stores/ui.ts
git commit -m "feat: make app shell responsive"
```

---

### Task 5: Dashboard and Session Cards

**Files:**
- Modify: `src/web/pages/Dashboard.tsx`
- Modify: `src/web/components/SessionCard.tsx`

- [ ] **Step 1: Replace `src/web/pages/Dashboard.tsx`**

```tsx
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'
import SessionCard from '../components/SessionCard'
import { useSessionsStore } from '../stores/sessions'

export default function Dashboard() {
  const { sessions } = useSessionsStore()

  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Active Sessions</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {sessions.length === 0 ? 'No sessions running' : `${sessions.length} tracked session${sessions.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <span className="rounded-[var(--radius-sm)] border border-[var(--color-border-default)] px-2 py-1 font-mono text-xs text-[var(--color-text-code)]">
            {sessions.length}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6 text-center">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">No active sessions</p>
              <p className="mt-1 max-w-xs text-xs text-[var(--color-text-muted)]">Open the project navigation and launch Claude Code from a saved project.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map(session => <SessionCard key={session.id} session={session} />)}
          </div>
        )}
      </div>

      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
```

- [ ] **Step 2: In `src/web/components/SessionCard.tsx`, update the root element and action styles**

Keep the existing functions (`stop`, `restart`, `remove`, `openTerminal`) and imports. Replace only the returned JSX with:

```tsx
return (
  <article
    data-testid="session-card"
    className={`flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] border-l-[3px] bg-[var(--color-bg-surface)] p-3 shadow-[var(--shadow-card)] sm:p-4 ${
      session.state === 'running'
        ? 'border-l-[var(--color-running)]'
        : session.state === 'launching'
          ? 'border-l-[var(--color-launching)]'
          : session.state === 'failed'
            ? 'border-l-[var(--color-failed)]'
            : 'border-l-[var(--color-stopped)]'
    }`}
  >
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{projectName}</p>
        <p className="rb-mono mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{session.agentId}</p>
      </div>
      <span className={`rb-mono shrink-0 whitespace-nowrap text-[11px] ${STATE_COLORS[session.state]}`}>
        {STATE_ICONS[session.state]} {session.state.charAt(0).toUpperCase() + session.state.slice(1)}
      </span>
    </div>

    {session.state === 'launching' && (
      <div className="overflow-hidden rounded-full bg-[var(--color-bg-overlay)]">
        <div className="h-1.5 w-1/2 rounded-full bg-[var(--color-launching)]" style={{ animation: 'rb-shimmer 1.4s ease-in-out infinite' }} />
      </div>
    )}

    {session.state === 'running' && session.remoteLink && (
      <a
        href={session.remoteLink}
        target="_blank"
        rel="noopener noreferrer"
        className="rb-primary-button w-full px-3"
      >
        <span className="truncate">Open Remote Control</span>
        <span aria-hidden="true">↗</span>
      </a>
    )}

    {session.state === 'failed' && (
      <p className="min-w-0 break-words text-xs text-[var(--color-failed)]">{session.error ?? 'Unknown error'}</p>
    )}

    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {session.state === 'running' && (
        <button type="button" onClick={stop} className="rb-ghost-button px-3 text-[var(--color-text-secondary)] sm:flex-1">
          Stop
        </button>
      )}
      {(session.state === 'stopped' || session.state === 'failed') && (
        <>
          <button type="button" onClick={restart} className="rb-ghost-button px-3 sm:flex-1">
            Restart
          </button>
          <button type="button" onClick={remove} className="rb-ghost-button px-3 text-[var(--color-failed)]">
            Delete
          </button>
        </>
      )}
      {(session.state === 'launching' || session.state === 'running') && (
        <button
          type="button"
          onClick={openTerminal}
          className="rb-ghost-button px-3 text-[var(--color-accent)]"
          title="Open interactive terminal"
          aria-label={`Open terminal for ${session.agentId} session ${session.id}`}
        >
          Term
        </button>
      )}
      <button
        type="button"
        onClick={() => setLogsSessionId(session.id)}
        className="rb-ghost-button px-3"
        aria-label={`View logs for ${session.agentId} session ${session.id}`}
      >
        Logs
      </button>
    </div>
  </article>
)
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run responsive tests**

Run:

```bash
npm run test:responsive
```

Expected: logs drawer width assertion may still fail until Task 6. Dashboard/card assertions should pass.

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/Dashboard.tsx src/web/components/SessionCard.tsx
git commit -m "feat: make dashboard cards responsive"
```

---

### Task 6: Responsive Logs Drawer and Modals

**Files:**
- Modify: `src/web/components/LogsDrawer.tsx`
- Modify: `src/web/components/AddProjectModal.tsx`
- Modify: `src/web/components/AgentSelectorModal.tsx`

- [ ] **Step 1: In `src/web/components/LogsDrawer.tsx`, replace the returned JSX**

Keep the existing imports, state, effects, and `openInTerminal`. Replace only the JSX after `if (!logsSessionId) return null` with:

```tsx
return (
  <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setLogsSessionId(null)}>
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`Logs - ${session?.agentId ?? logsSessionId}`}
      className="flex h-full w-full max-w-full flex-col border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl sm:max-w-xl"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-3 py-3 sm:px-4">
        <h2 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]">
          Logs - {session?.agentId ?? logsSessionId}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {session && (session.state === 'launching' || session.state === 'running') && (
            <button
              type="button"
              onClick={openInTerminal}
              className="rb-ghost-button px-2 text-[var(--color-accent)] sm:px-3"
            >
              <span className="hidden sm:inline">Open Terminal</span>
              <span className="sm:hidden">Term</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setLogsSessionId(null)}
            className="rb-icon-button"
            aria-label="Close logs"
            title="Close logs"
          >
            x
          </button>
        </div>
      </div>
      <div className="rb-scrollbar rb-safe-bottom min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-5 text-[var(--color-text-code)] sm:p-4 sm:text-xs">
        {session?.logs.map((line, i) => (
          <p key={i} className={`min-w-0 break-words ${line.match(/https?:\/\//) ? 'font-semibold text-[var(--color-accent)]' : ''}`}>
            {line}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  </div>
)
```

- [ ] **Step 2: In `src/web/components/AddProjectModal.tsx`, replace modal shell classes**

Replace the outer JSX returned by the component with this structure, keeping existing form fields and save logic:

```tsx
return (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setAddProjectOpen(false)}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Project"
      className="rb-safe-bottom max-h-[100dvh] w-full overflow-hidden rounded-t-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)] sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[var(--radius-xl)]"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Add Project</h2>
        <button type="button" onClick={() => setAddProjectOpen(false)} className="rb-icon-button" aria-label="Close add project" title="Close">x</button>
      </div>
      <div className="rb-scrollbar max-h-[calc(100dvh-128px)] space-y-4 overflow-y-auto p-4 sm:max-h-[calc(90dvh-128px)]">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="rb-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Absolute Path *</label>
          <input value={path} onChange={e => setPath(e.target.value)} placeholder="/home/user/projects/my-app" className="rb-input rb-mono text-[13px]" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Environment Variables (optional, KEY=VALUE per line)</label>
          <textarea value={envRaw} onChange={e => setEnvRaw(e.target.value)} rows={4} className="rb-input rb-mono min-h-24 resize-y text-[13px]" />
        </div>
        {error && <p className="break-words text-xs text-[var(--color-failed)]">{error}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] p-4">
        <button type="button" onClick={() => setAddProjectOpen(false)} className="rb-ghost-button">Cancel</button>
        <button type="button" onClick={save} disabled={loading || !name || !path} className="rb-primary-button disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'Saving...' : 'Save Project'}
        </button>
      </div>
    </div>
  </div>
)
```

- [ ] **Step 3: In `src/web/components/AgentSelectorModal.tsx`, replace modal shell classes**

Replace the returned JSX with:

```tsx
return (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setAgentSelectorProjectId(null)}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Launch Agent"
      className="rb-safe-bottom max-h-[100dvh] w-full overflow-hidden rounded-t-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)] sm:max-w-md sm:rounded-[var(--radius-xl)]"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Launch Agent</h2>
        <button type="button" onClick={() => setAgentSelectorProjectId(null)} className="rb-icon-button" aria-label="Close launch agent" title="Close">x</button>
      </div>
      <div className="rb-scrollbar max-h-[calc(100dvh-128px)] space-y-2 overflow-y-auto p-4 sm:max-h-[60dvh]">
        {agents.map(agent => (
          <label
            key={agent.id}
            className={`flex min-w-0 items-start gap-3 rounded-[var(--radius-lg)] border p-3 transition-colors ${
              selected === agent.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-glow)]' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]'
            } ${!agent.enabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
          >
            <input
              type="radio"
              name="agent"
              value={agent.id}
              checked={selected === agent.id}
              disabled={!agent.enabled}
              onChange={() => setSelected(agent.id)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">
                {agent.name} {!agent.enabled && <span className="text-xs text-[var(--color-text-muted)]">(Phase 2)</span>}
              </span>
              <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{agent.command} {agent.args.join(' ')}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] p-4">
        <button type="button" onClick={() => setAgentSelectorProjectId(null)} className="rb-ghost-button">Cancel</button>
        <button type="button" onClick={launch} disabled={loading} className="rb-primary-button disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'Launching...' : 'Launch'}
        </button>
      </div>
    </div>
  </div>
)
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Run responsive tests**

Run:

```bash
npm run test:responsive
```

Expected: PASS for mobile drawer, logs drawer, dashboard, and shell assertions.

- [ ] **Step 6: Commit**

```bash
git add src/web/components/LogsDrawer.tsx src/web/components/AddProjectModal.tsx src/web/components/AgentSelectorModal.tsx
git commit -m "feat: make drawers and modals responsive"
```

---

### Task 7: Login, Settings, and Terminal Panel Responsiveness

**Files:**
- Modify: `src/web/pages/LoginPage.tsx`
- Modify: `src/web/pages/SettingsPage.tsx`
- Modify: `src/web/components/TerminalPanel.tsx`
- Modify: `src/web/components/TerminalTab.tsx`

- [ ] **Step 1: Replace `src/web/pages/LoginPage.tsx` styling-only JSX**

Keep the existing state and `submit` function. Replace the returned JSX with:

```tsx
return (
  <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-bg-base)] px-4 py-8">
    <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-modal)] sm:p-8">
      <div className="mb-6 flex items-center justify-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-dim)] font-mono text-xs font-semibold text-[var(--color-accent)]">RB</span>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">RemoteBridge</h1>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="rb-input"
          autoFocus
        />
        {error && <p className="break-words text-sm text-[var(--color-failed)]">{error}</p>}
        <button type="submit" disabled={loading} className="rb-primary-button w-full disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  </div>
)
```

- [ ] **Step 2: Replace `src/web/pages/SettingsPage.tsx` with responsive form layout**

```tsx
import { useState } from 'react'
import { api } from '../lib/api'
import { useConfigStore } from '../stores/config'
import type { AppConfig } from '../../types'

type SafeConfig = Omit<AppConfig, 'password' | 'sessionSecret'>

export default function SettingsPage() {
  const { config, setConfig } = useConfigStore()
  const [form, setForm] = useState<Partial<SafeConfig>>(config ?? {})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (!config) return null

  const save = async () => {
    setError('')
    setSaved(false)
    try {
      const updated = await api.updateConfig(form)
      setConfig(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      setError((err as Error).message)
    }
  }

  const field = (key: keyof SafeConfig, label: string, type = 'text') => (
    <label className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
      <input
        type={type}
        value={String(form[key] ?? '')}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="rb-input"
      />
    </label>
  )

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-5 text-lg font-semibold text-[var(--color-text-primary)]">Settings</h1>
      <div className="space-y-6 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 shadow-[var(--shadow-card)] sm:p-6">
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Network</p>
          <div className="space-y-3">
            {field('port', 'Port', 'number')}
            {field('host', 'Host')}
          </div>
        </section>
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Session Behavior</p>
          <div className="space-y-3">
            {field('linkExtractTimeout', 'Link Timeout (s)', 'number')}
            {field('maxConcurrentSessions', 'Max Sessions', 'number')}
            {field('keepSessionLogsLines', 'Log Lines', 'number')}
          </div>
        </section>
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Logging</p>
          <label className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-3">
            <span className="text-sm text-[var(--color-text-secondary)]">Log Level</span>
            <select
              value={String(form.logLevel ?? 'info')}
              onChange={e => setForm(f => ({ ...f, logLevel: e.target.value as SafeConfig['logLevel'] }))}
              className="rb-input"
            >
              {['debug', 'info', 'warn', 'error'].map(level => <option key={level}>{level}</option>)}
            </select>
          </label>
        </section>
        {error && <p className="break-words text-sm text-[var(--color-failed)]">{error}</p>}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" onClick={() => { setForm(config); setError('') }} className="rb-ghost-button px-4">
            Reset
          </button>
          <button type="button" onClick={save} className="rb-primary-button px-4">
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: In `src/web/components/TerminalPanel.tsx`, adjust collapsed and expanded shells**

Replace the collapsed return block with:

```tsx
return (
  <div className="shrink-0 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]">
    <div className="flex items-center px-3 py-1.5">
      <button
        type="button"
        onClick={handleNewTerminal}
        className="rb-ghost-button min-h-8 px-2"
        title="New Terminal"
        aria-label="Open new terminal"
      >
        <span aria-hidden="true">$</span>
        <span>Terminal</span>
      </button>
    </div>
  </div>
)
```

Replace the expanded root `div` opening with:

```tsx
<div
  className="flex shrink-0 flex-col border-t border-[var(--color-border-default)] bg-[var(--color-bg-base)]"
  style={{ height: `clamp(220px, ${panelHeight}vh, 70dvh)` }}
>
```

Replace the tab bar action button container with:

```tsx
<div className="flex shrink-0 items-center gap-2 px-2 py-1">
  <button
    type="button"
    onClick={handleNewTerminal}
    className="rb-primary-button min-h-8 px-2.5 text-xs"
    title="New Standalone Terminal"
    aria-label="Open new terminal"
  >
    <span>+</span>
    <span className="hidden sm:inline">Shell</span>
  </button>
  <button
    type="button"
    onClick={togglePanel}
    className="rb-ghost-button min-h-8 px-2.5 text-xs"
    title="Collapse Panel"
    aria-label="Collapse terminal panel"
  >
    <span>Hide</span>
  </button>
</div>
```

- [ ] **Step 4: In `src/web/components/TerminalTab.tsx`, refit on viewport resize**

Add this effect after the existing active-tab refit effect:

```tsx
useEffect(() => {
  const refit = () => fitAddonRef.current?.fit()
  window.addEventListener('resize', refit)
  window.addEventListener('orientationchange', refit)
  return () => {
    window.removeEventListener('resize', refit)
    window.removeEventListener('orientationchange', refit)
  }
}, [])
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Run responsive tests**

Run:

```bash
npm run test:responsive
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/web/pages/LoginPage.tsx src/web/pages/SettingsPage.tsx src/web/components/TerminalPanel.tsx src/web/components/TerminalTab.tsx
git commit -m "feat: finish responsive ui surfaces"
```

---

### Task 8: Final Verification and Cleanup

**Files:**
- Review: all files changed in Tasks 1-7

- [ ] **Step 1: Scan for raw one-off color utility usage in touched UI files**

Run:

```bash
rg "text-(gray|blue|red|green|yellow)|bg-(gray|blue|red|green|yellow)|border-(gray|blue|red|green|yellow)" src/web/components src/web/pages src/web/index.css
```

Expected: no matches in files touched by this responsive plan, except third-party xterm CSS imports if `rg` traverses generated output. Replace any matches with `var(--color-*)` classes before continuing.

- [ ] **Step 2: Run full TypeScript check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run existing tests**

Run:

```bash
npm test
```

Expected: PASS. If existing terminal e2e tests depend on backend terminal features in the dirty worktree, investigate failures without reverting terminal code.

- [ ] **Step 4: Run responsive browser tests**

Run:

```bash
npm run test:responsive
```

Expected: PASS in Chromium at mobile, tablet, and desktop viewports.

- [ ] **Step 5: Build production assets**

Run:

```bash
npm run build
```

Expected: PASS. Vite emits `dist/web`; tsup emits backend and CLI artifacts.

- [ ] **Step 6: Manual smoke check in dev server**

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

Expected:

- Mobile viewport: project nav opens from the menu button and closes after choosing a project.
- Tablet viewport: compact sidebar does not overlap cards.
- Desktop viewport: sidebar is full width and cards fill multiple columns.
- Logs drawer never causes horizontal page scrolling.
- Terminal panel can be opened/collapsed and tab labels scroll horizontally instead of pushing actions off-screen.

Stop the dev server with `Ctrl+C` after the smoke check.

- [ ] **Step 7: Commit final cleanup**

```bash
git status --short
git add package.json package-lock.json playwright.config.ts tests/e2e/responsive-ui.spec.ts src/web
git commit -m "feat: implement responsive web ui"
```

If earlier task commits were already made, skip this final commit and only commit any cleanup changes with:

```bash
git add src/web tests/e2e/responsive-ui.spec.ts
git commit -m "chore: polish responsive ui"
```

---

## Self-Review

Spec coverage:

- Desktop/tablet/mobile layouts from `docs/DESIGN.md` are covered by Tasks 4, 5, and 6.
- Persistent public-host warning from NFR3 is covered by Task 4.
- Logs drawer and live log readability from Phase 1 are covered by Task 6.
- Settings, login, and terminal surfaces are covered by Task 7.
- Verification across viewport sizes is covered by Tasks 1 and 8.

Placeholder scan:

- No task contains deferred-work markers or empty implementation instructions.
- Every code-changing task includes concrete code or concrete replacement snippets.
- Every test command includes an expected result.

Type consistency:

- `mobileSidebarOpen` and `setMobileSidebarOpen` are introduced in `useUIStore` before `Header`, `Layout`, and `Sidebar` use them.
- Playwright selectors match the planned accessible labels and `data-testid="session-card"`.
- `config.host`, `session.agentId`, `session.id`, `session.logs`, and other properties match existing shared types in `src/types.ts`.
