# Project-Centric Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the RemoteBridge web UI around a "project = workspace" model: an icon-rail sidebar, a home Overview with project cards, a per-project Workspace (sessions + terminals scoped by project), identifiable session rows, and an opencode-style folder browser for opening projects.

**Architecture:** Frontend stays on flat zustand stores; per-project views are *derived* by filtering on `projectId`. Navigation lives in the URL via react-router (`/` = Overview, `/project/:projectId` = Workspace). Terminals carry a `projectId` echoed through the existing WebSocket terminal protocol. One new read-only backend route (`GET /api/fs/browse`) powers the folder browser.

**Tech Stack:** React 18, react-router-dom 6, zustand 4, TailwindCSS 3 (CSS-var tokens + `rb-*` component classes), lucide-react, Fastify 4 (server), vitest (unit/route tests, node env), Playwright (e2e).

**Spec:** [docs/superpowers/specs/2026-05-29-project-centric-workspace-design.md](../specs/2026-05-29-project-centric-workspace-design.md)

---

## Conventions for this plan

- **Testing reality:** the repo has **no** jsdom / @testing-library — vitest runs in `node` env (`tests/**/*.test.ts`). So:
  - Pure logic (`format.ts` helpers, `fs.browse` directory listing) is built **test-first with vitest**.
  - React components are verified with **Playwright e2e** (`tests/e2e/`) and a manual run. Do not add component unit tests; follow the existing pattern.
- **Design tokens:** use existing CSS vars (`var(--color-*)`, `var(--radius-*)`, `var(--shadow-*)`) and component classes (`rb-icon-button`, `rb-ghost-button`, `rb-primary-button`, `rb-input`, `rb-mono`, `rb-focus`, `rb-scrollbar`, `rb-safe-bottom`). Accent is **blue** `var(--color-accent)` (#3b82f6); running=green, launching=amber, failed=red, stopped=grey. Project avatars deliberately use a per-project `hsl()` hue (the one splash of color), so they are inline styles, not tokens. Never hardcode other hex outside `index.css`.
- **API envelope:** there is **no** `core/http` helper. Success is returned as a plain object `{ ok: true, data }`; errors as `reply.code(N).send({ ok: false, error: { code, message } })` (see `src/server/routes/projects.ts`). The client `request()` in `api.ts` unwraps `json.data` and throws on `!json.ok`.
- **Commit after every task.** Branch is already `feat/phase1-implementation`.
- **Run the dev app:** `npm run dev` (server :4091 + vite :5173). Unit tests: `npm test`. e2e: `npx playwright test`.

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/web/lib/format.ts` | create | Pure presentation helpers: `shortId`, `formatRelativeTime`, `formatDuration`, `initials`, `projectHue`, `STATE_RANK`, `compareSessions` |
| `tests/web/format.test.ts` | create | Unit tests for the helpers |
| `src/web/components/SessionRow.tsx` | create | Presentational session row (replaces SessionCard) |
| `src/web/components/SessionCard.tsx` | delete | Superseded by SessionRow |
| `src/web/stores/ui.ts` | modify | Add `sidebarCollapsed` + `toggleSidebar` (localStorage-persisted) |
| `src/web/App.tsx` | modify | Routes: `/` Overview, `/project/:projectId` Workspace |
| `src/web/components/Sidebar.tsx` | rewrite | Icon rail: Overview, project avatars (hue + running dot + tooltip), add, settings/help, collapse toggle |
| `src/web/pages/ProjectWorkspace.tsx` | create | Per-project sessions + terminals |
| `src/web/pages/Overview.tsx` | create | Home screen + project card grid (replaces Dashboard) |
| `src/web/pages/Dashboard.tsx` | delete | Superseded by Overview |
| `src/web/components/ProjectCard.tsx` | create | One project tile on the Overview |
| `src/types.ts` | modify | Add optional `projectId`/`cwd` to terminal create/created payloads |
| `src/web/stores/terminals.ts` | modify | Add `projectId` to `TerminalTabInfo` |
| `src/server/ws/index.ts` | modify | Echo `projectId` (and accept `cwd`) on terminal create |
| `src/web/lib/ws.ts` | modify | Carry `projectId` into the standalone tab on `terminal.created` |
| `src/web/components/TerminalPanel.tsx` | modify | Filter tabs by the active project; `+ Shell` sends `cwd`+`projectId` |
| `src/server/routes/fs.ts` | create | `GET /api/fs/browse` + pure `listDirectories()` |
| `tests/routes/fs.test.ts` | create | Tests for `listDirectories()` + route smoke |
| `src/server/index.ts` | modify | Register `fsRoutes` |
| `src/web/lib/api.ts` | modify | Add `browseFolder()` |
| `src/web/components/AddProjectModal.tsx` | rewrite | Folder browser ("Open project") |
| `tests/e2e/workspace.spec.ts` | create | e2e: navigation, scoping, collapse persistence, folder browser |

> **Deviation from spec (YAGNI):** `/` always renders the Overview home (matches the opencode reference). The "redirect to last opened project" idea is dropped; only `sidebarCollapsed` is persisted.

---

## Task 1: Presentation helpers (`format.ts`)

**Files:**
- Create: `src/web/lib/format.ts`
- Test: `tests/web/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/web/format.test.ts
import { describe, it, expect } from 'vitest'
import {
  shortId, formatRelativeTime, formatDuration, initials, projectHue,
  STATE_RANK, compareSessions
} from '../../src/web/lib/format'
import type { Session } from '../../src/types'

const T0 = Date.parse('2026-05-29T12:00:00.000Z')

describe('shortId', () => {
  it('takes the last 4 chars, prefixed with #', () => {
    expect(shortId('abc123def456')).toBe('#f456')
  })
  it('handles short ids without crashing', () => {
    expect(shortId('a1')).toBe('#a1')
  })
})

describe('formatRelativeTime', () => {
  it('shows "just now" under a minute', () => {
    expect(formatRelativeTime('2026-05-29T11:59:30.000Z', T0)).toBe('just now')
  })
  it('shows minutes, hours, days', () => {
    expect(formatRelativeTime('2026-05-29T11:55:00.000Z', T0)).toBe('5m ago')
    expect(formatRelativeTime('2026-05-29T09:00:00.000Z', T0)).toBe('3h ago')
    expect(formatRelativeTime('2026-05-27T12:00:00.000Z', T0)).toBe('2d ago')
  })
})

describe('formatDuration', () => {
  it('formats minutes and hours between two times', () => {
    expect(formatDuration('2026-05-29T11:55:00.000Z', '2026-05-29T12:00:00.000Z')).toBe('5m')
    expect(formatDuration('2026-05-29T10:30:00.000Z', '2026-05-29T12:00:00.000Z')).toBe('1h 30m')
  })
  it('uses seconds under a minute', () => {
    expect(formatDuration('2026-05-29T11:59:50.000Z', '2026-05-29T12:00:00.000Z')).toBe('10s')
  })
})

describe('initials', () => {
  it('uppercases the first two alphanumeric chars', () => {
    expect(initials('agent-bridge-temote')).toBe('AG')
    expect(initials('one-lotte')).toBe('ON')
    expect(initials('x')).toBe('X')
    expect(initials('')).toBe('?')
  })
})

describe('projectHue', () => {
  it('is deterministic and within 0..359', () => {
    const h = projectHue('proj-1')
    expect(h).toBe(projectHue('proj-1'))
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(360)
  })
  it('differs for different ids (usually)', () => {
    expect(projectHue('proj-1')).not.toBe(projectHue('proj-2'))
  })
})

describe('compareSessions', () => {
  const mk = (state: Session['state'], startedAt: string): Session => ({
    id: state + startedAt, projectId: 'p', agentId: 'claude', pid: null,
    state, remoteLink: null, logs: [], startedAt, stoppedAt: null, error: null
  })
  it('orders running < launching < failed < stopped, then newest first', () => {
    expect(STATE_RANK.running).toBeLessThan(STATE_RANK.stopped)
    const list = [
      mk('stopped', '2026-05-29T11:00:00.000Z'),
      mk('running', '2026-05-29T10:00:00.000Z'),
      mk('running', '2026-05-29T11:00:00.000Z'),
      mk('failed', '2026-05-29T11:00:00.000Z')
    ].sort(compareSessions)
    expect(list.map(s => `${s.state}@${s.startedAt.slice(11,16)}`))
      .toEqual(['running@11:00', 'running@10:00', 'failed@11:00', 'stopped@11:00'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/web/format.test.ts`
Expected: FAIL — `Cannot find module '../../src/web/lib/format'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/web/lib/format.ts
import type { Session, SessionState } from '../../types'

export function shortId(id: string): string {
  return '#' + id.slice(-4)
}

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso))
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function formatDuration(fromIso: string, toIso: string | number = Date.now()): string {
  const to = typeof toIso === 'number' ? toIso : Date.parse(toIso)
  const diff = Math.max(0, to - Date.parse(fromIso))
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM ? `${h}h ${remM}m` : `${h}h`
}

export function initials(name: string): string {
  const chars = (name.match(/[a-z0-9]/gi) ?? []).slice(0, 2)
  return chars.length ? chars.join('').toUpperCase() : '?'
}

export function projectHue(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

export const STATE_RANK: Record<SessionState, number> = {
  running: 0, launching: 1, failed: 2, stopped: 3
}

export function compareSessions(a: Session, b: Session): number {
  const r = STATE_RANK[a.state] - STATE_RANK[b.state]
  if (r !== 0) return r
  return Date.parse(b.startedAt) - Date.parse(a.startedAt) // newest first
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/web/format.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/format.ts tests/web/format.test.ts
git commit -m "feat(web): add presentation helpers for session identity + sort"
```

---

## Task 2: SessionRow component (+ fix Restart stretch)

Replaces `SessionCard`. A session is now identifiable by `#shortId`, agent, and time;
the project name is dropped (it lives in the workspace/overview header). The Restart
button no longer uses `sm:flex-1` (the empty-box bug).

**Files:**
- Create: `src/web/components/SessionRow.tsx`
- Delete: `src/web/components/SessionCard.tsx`

- [ ] **Step 1: Create `SessionRow.tsx`**

```tsx
// src/web/components/SessionRow.tsx
import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'
import { shortId, formatRelativeTime, formatDuration } from '../lib/format'
import type { Session } from '../../types'

const STATE_COLORS = {
  launching: 'text-[var(--color-launching)]',
  running: 'text-[var(--color-running)]',
  stopped: 'text-[var(--color-stopped)]',
  failed: 'text-[var(--color-failed)]'
} as const
const STATE_ICONS = { launching: '◌', running: '●', stopped: '○', failed: '⚠' }
const BORDER = {
  running: 'border-l-[var(--color-running)]',
  launching: 'border-l-[var(--color-launching)]',
  failed: 'border-l-[var(--color-failed)]',
  stopped: 'border-l-[var(--color-stopped)]'
} as const

function timeLabel(s: Session): string {
  if (s.state === 'running' || s.state === 'launching') {
    return `running ${formatDuration(s.startedAt)}`
  }
  const ran = s.stoppedAt ? `ran ${formatDuration(s.startedAt, s.stoppedAt)} · ` : ''
  const when = s.stoppedAt ?? s.startedAt
  return `${ran}${formatRelativeTime(when)}`
}

export default function SessionRow({ session }: { session: Session }) {
  const { updateSession, removeSession } = useSessionsStore()
  const { setLogsSessionId } = useUIStore()

  const stop = async () => updateSession(session.id, await api.stopSession(session.id))
  const restart = async () => updateSession(session.id, await api.restartSession(session.id))
  const remove = async () => { await api.deleteSession(session.id); removeSession(session.id) }

  const openTerminal = () => {
    const existing = useTerminalsStore.getState().tabs.find(t => t.sessionId === session.id)
    if (existing) {
      useTerminalsStore.getState().setActiveTab(existing.id)
      useTerminalsStore.getState().setPanelOpen(true)
      return
    }
    sendWsMessage({ type: 'terminal.attach', payload: { sessionId: session.id } })
    useTerminalsStore.getState().addTab({
      id: session.id,
      title: `${session.agentId} ${shortId(session.id)}`,
      type: 'session',
      sessionId: session.id,
      projectId: session.projectId
    })
  }

  return (
    <article
      data-testid="session-row"
      className={`flex min-w-0 flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] border-l-[3px] bg-[var(--color-bg-surface)] p-3 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:gap-3 ${BORDER[session.state]}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={`rb-mono shrink-0 text-[13px] ${STATE_COLORS[session.state]}`} aria-hidden="true">
          {STATE_ICONS[session.state]}
        </span>
        <div className="min-w-0">
          <p className="rb-mono truncate text-sm text-[var(--color-text-primary)]">
            {shortId(session.id)} <span className="text-[var(--color-text-muted)]">· {session.agentId}</span>
          </p>
          <p className="truncate text-[11px] text-[var(--color-text-muted)]">{timeLabel(session)}</p>
        </div>
      </div>

      {session.state === 'failed' && (
        <p className="min-w-0 break-words text-xs text-[var(--color-failed)] sm:max-w-[40%]">{session.error ?? 'Unknown error'}</p>
      )}

      {session.state === 'running' && session.remoteLink && (
        <a href={session.remoteLink} target="_blank" rel="noopener noreferrer" className="rb-primary-button shrink-0 px-3">
          <span className="truncate">Open Remote</span><span aria-hidden="true">↗</span>
        </a>
      )}

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {session.state === 'running' && (
          <button type="button" onClick={stop} className="rb-ghost-button px-3">Stop</button>
        )}
        {(session.state === 'stopped' || session.state === 'failed') && (
          <>
            <button type="button" onClick={restart} className="rb-ghost-button px-3">Restart</button>
            <button type="button" onClick={remove} className="rb-ghost-button px-3 text-[var(--color-failed)]">Delete</button>
          </>
        )}
        {(session.state === 'launching' || session.state === 'running') && (
          <button type="button" onClick={openTerminal} className="rb-ghost-button px-3 text-[var(--color-accent)]"
            title="Open interactive terminal" aria-label={`Open terminal for session ${session.id}`}>
            Term
          </button>
        )}
        <button type="button" onClick={() => setLogsSessionId(session.id)} className="rb-ghost-button px-3"
          aria-label={`View logs for session ${session.id}`}>
          Logs
        </button>
      </div>
    </article>
  )
}
```

> Note: `addTab({ ..., projectId })` requires the store change in Task 6. TypeScript
> will error until then — that is expected; Task 6 closes it. (If running tasks
> strictly in order, do Task 6's store edit before type-checking this file, or accept
> the transient error until Task 6.)

- [ ] **Step 2: Delete the old card**

```bash
git rm src/web/components/SessionCard.tsx
```

- [ ] **Step 3: Commit (compile deferred to consumers)**

```bash
git add src/web/components/SessionRow.tsx
git commit -m "feat(web): SessionRow with #id + relative time, fix Restart stretch"
```

---

## Task 3: UIStore sidebar-collapse preference + routes

**Files:**
- Modify: `src/web/stores/ui.ts`
- Modify: `src/web/App.tsx:41-47` (the `AppInner` `<Routes>`)

- [ ] **Step 1: Add collapse state to the UI store**

Replace the contents of `src/web/stores/ui.ts` with:

```ts
import { create } from 'zustand'

const COLLAPSE_KEY = 'rb-sidebar-collapsed'
const initialCollapsed = (() => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
})()

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  mobileSidebarOpen: boolean
  sidebarCollapsed: boolean
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  logsSessionId: null,
  mobileSidebarOpen: false,
  sidebarCollapsed: initialCollapsed,
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id, mobileSidebarOpen: false }),
  setLogsSessionId: (id) => set({ logsSessionId: id }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  toggleSidebar: () => set(state => {
    const next = !state.sidebarCollapsed
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
    return { sidebarCollapsed: next }
  })
}))
```

- [ ] **Step 2: Update routes in `App.tsx`**

In `src/web/App.tsx`, change the imports and the `AppInner` Routes. Replace:

```tsx
import Dashboard from './pages/Dashboard'
```
with:
```tsx
import Overview from './pages/Overview'
import ProjectWorkspace from './pages/ProjectWorkspace'
```

and replace the `AppInner` `<Routes>` block (currently lines ~41-46):

```tsx
  return (
    <Routes>
      <Route path="/" element={<Layout><Overview /></Layout>} />
      <Route path="/project/:projectId" element={<Layout><ProjectWorkspace /></Layout>} />
      <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
    </Routes>
  )
```

> `Overview` and `ProjectWorkspace` are created in Tasks 5 and 7. To keep the app
> compiling between tasks, create temporary one-line stubs now and flesh them out later:
> ```bash
> printf "export default function Overview(){return null}\n" > src/web/pages/Overview.tsx
> printf "export default function ProjectWorkspace(){return null}\n" > src/web/pages/ProjectWorkspace.tsx
> ```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: passes (transient `projectId` error from Task 2 resolved once Task 6 runs; if blocking, do Task 6 next).

- [ ] **Step 4: Commit**

```bash
git add src/web/stores/ui.ts src/web/App.tsx src/web/pages/Overview.tsx src/web/pages/ProjectWorkspace.tsx
git commit -m "feat(web): add /project/:id route + sidebar-collapse preference"
```

---

## Task 4: Sidebar — icon rail with collapse

**Files:**
- Rewrite: `src/web/components/Sidebar.tsx`

Behavior: collapsed = icon-only (w-14); expanded = w-60 with names. Toggle persists
(Task 3). Top = Overview link. Project avatars use `projectHue`/`initials`, show a
running dot, and a hover tooltip with name+path. Bottom = Add / Settings / Help.
Clicking an avatar navigates (`/project/:id`); the play icon launches a session.

- [ ] **Step 1: Rewrite the component**

```tsx
// src/web/components/Sidebar.tsx
import { Grid2x2, HelpCircle, Play, Plus, Settings, X, PanelLeft } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { initials, projectHue } from '../lib/format'
import type { Project } from '../../types'

export default function Sidebar() {
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const {
    mobileSidebarOpen, sidebarCollapsed,
    setAddProjectOpen, setAgentSelectorProjectId, setMobileSidebarOpen, toggleSidebar
  } = useUIStore()

  const isActive = (id: string) =>
    sessions.some(s => s.projectId === id && (s.state === 'launching' || s.state === 'running'))

  const rail = (expanded: boolean) => (
    <>
      <div className="flex h-12 shrink-0 items-center gap-1 px-2">
        <button type="button" onClick={toggleSidebar} className="rb-icon-button"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title="Toggle sidebar">
          <PanelLeft size={17} />
        </button>
        {expanded && <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Projects</span>}
      </div>

      <NavLink to="/" end className={({ isActive: a }) =>
        `mx-2 mb-1 flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 transition-colors ${a ? 'bg-[var(--color-bg-overlay)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}
        title="Overview">
        <Grid2x2 size={18} className="shrink-0" />
        {expanded && <span className="truncate text-sm">Overview</span>}
      </NavLink>

      <div className="rb-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {projects.map(p => (
          <ProjectEntry key={p.id} project={p} expanded={expanded} running={isActive(p.id)}
            onLaunch={() => setAgentSelectorProjectId(p.id)}
            onNavigate={() => setMobileSidebarOpen(false)} />
        ))}
        <button type="button" onClick={() => setAddProjectOpen(true)}
          className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label="Add project" title="Add project">
          <Plus size={18} className="shrink-0" />
          {expanded && <span className="truncate text-sm">Add project</span>}
        </button>
      </div>

      <div className="shrink-0 space-y-1 border-t border-[var(--color-border-subtle)] p-2">
        <Link to="/settings" className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]" title="Settings">
          <Settings size={18} className="shrink-0" />{expanded && <span className="text-sm">Settings</span>}
        </Link>
        <a href="https://github.com/sowndev/remotebridge" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]" title="Help">
          <HelpCircle size={18} className="shrink-0" />{expanded && <span className="text-sm">Help</span>}
        </a>
      </div>
    </>
  )

  const desktopWidth = sidebarCollapsed ? 'w-14' : 'w-60'

  return (
    <>
      <aside aria-label="Projects" className={`hidden shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] md:flex ${desktopWidth}`}>
        {rail(!sidebarCollapsed)}
      </aside>
      <aside aria-label="Projects" aria-hidden={!mobileSidebarOpen}
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(84vw,320px)] flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl transition-transform duration-200 md:hidden ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Projects</span>
          <button type="button" aria-label="Close project navigation" title="Close" className="rb-icon-button" onClick={() => setMobileSidebarOpen(false)}>
            <X size={17} />
          </button>
        </div>
        {rail(true)}
      </aside>
    </>
  )
}

function ProjectEntry({ project, expanded, running, onLaunch, onNavigate }: {
  project: Project; expanded: boolean; running: boolean; onLaunch: () => void; onNavigate: () => void
}) {
  const hue = projectHue(project.id)
  return (
    <NavLink to={`/project/${project.id}`} onClick={onNavigate}
      title={`${project.name}\n${project.path}`}
      className={({ isActive }) =>
        `group relative flex items-center gap-2 rounded-[var(--radius-md)] border px-1.5 py-1.5 transition-colors ${isActive ? 'border-[var(--color-border-default)] bg-[var(--color-bg-overlay)]' : 'border-transparent hover:bg-[var(--color-bg-hover)]'}`}>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xs font-semibold text-white"
        style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}>
        {initials(project.name)}
        {running && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-bg-surface)] bg-[var(--color-running)]" />}
      </span>
      {expanded && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{project.name}</span>
          <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{project.path}</span>
        </span>
      )}
      {expanded && (
        <button type="button" aria-label={`Launch session in ${project.name}`} title="New session"
          onClick={(e) => { e.preventDefault(); onLaunch() }}
          className="rb-icon-button h-7 min-h-7 min-w-7 shrink-0 text-[var(--color-accent)]">
          <Play size={14} />
        </button>
      )}
    </NavLink>
  )
}
```

- [ ] **Step 2: Type-check + run**

Run: `npx tsc --noEmit -p tsconfig.json && npm run dev`
Manual: rail toggles between icon-only and expanded; reload keeps the state; clicking
an avatar goes to `/project/:id`; the play button opens the agent selector.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/Sidebar.tsx
git commit -m "feat(web): icon-rail sidebar with collapse, project avatars, running dots"
```

---

## Task 5: ProjectWorkspace page

**Files:**
- Replace stub: `src/web/pages/ProjectWorkspace.tsx`

Shows one project's sessions (sorted) plus a hint to its terminals. Reads `projectId`
from the route, filters the flat sessions store, and reuses `SessionRow`. Terminal
scoping itself is wired in Task 6 (TerminalPanel reads the same route param).

- [ ] **Step 1: Implement the page**

```tsx
// src/web/pages/ProjectWorkspace.tsx
import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'
import SessionRow from '../components/SessionRow'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'
import { compareSessions, projectHue, initials } from '../lib/format'

export default function ProjectWorkspace() {
  const { projectId } = useParams()
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const { setAgentSelectorProjectId } = useUIStore()

  const project = projects.find(p => p.id === projectId)
  const projectSessions = useMemo(
    () => sessions.filter(s => s.projectId === projectId).slice().sort(compareSessions),
    [sessions, projectId]
  )

  // projects load async; wait one tick before deciding it's missing
  if (!project) {
    return projects.length === 0
      ? <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
      : <Navigate to="/" replace />
  }

  const hue = projectHue(project.id)
  const openShell = () => sendWsMessage({ type: 'terminal.create', payload: { cwd: project.path, projectId: project.id } })

  return (
    <>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold text-white" style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}>
            {initials(project.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-[var(--color-text-primary)]">{project.name}</h1>
            <p className="rb-mono truncate text-xs text-[var(--color-text-muted)]">{project.path}</p>
          </div>
          <button type="button" onClick={() => setAgentSelectorProjectId(project.id)} className="rb-primary-button px-3">
            + New session
          </button>
        </header>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              Sessions ({projectSessions.length})
            </p>
          </div>
          {projectSessions.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] text-center text-xs text-[var(--color-text-muted)]">
              No sessions yet. Launch one with “+ New session”.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {projectSessions.map(s => <SessionRow key={s.id} session={s} />)}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Terminals</p>
            <button type="button" onClick={openShell} className="rb-ghost-button px-3" title="Open a shell in this project">
              <span aria-hidden="true">$</span> Shell
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Shells and agent terminals for this project appear in the panel below.
          </p>
        </section>
      </div>

      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit -p tsconfig.json` (passes after Task 6 for the `projectId` payload; safe to proceed).

- [ ] **Step 3: Commit**

```bash
git add src/web/pages/ProjectWorkspace.tsx
git commit -m "feat(web): ProjectWorkspace page with scoped sessions + shell launcher"
```

---

## Task 6: Scope terminals by project (protocol echo)

The standalone-terminal tab is created in [ws.ts:33-40](../../../src/web/lib/ws.ts)
on `terminal.created`, which only carries `{terminalId,title,pid}`. To own a terminal
by project, thread `projectId` (and `cwd`) through the create→created round-trip.

**Files:**
- Modify: `src/types.ts:60-72` (terminal payloads)
- Modify: `src/web/stores/terminals.ts:3-9` (`TerminalTabInfo`)
- Modify: `src/server/ws/index.ts` (the `terminal.create` handler)
- Modify: `src/web/lib/ws.ts:33-40` (carry `projectId` into the tab)
- Modify: `src/web/components/TerminalPanel.tsx` (filter by active project; `+ Shell` passes cwd+projectId)

- [ ] **Step 1: Extend the terminal protocol types**

In `src/types.ts`, update the two terminal payloads:

```ts
  | { type: 'terminal.create'; payload: { cwd?: string; projectId?: string | null } }
```
```ts
  | { type: 'terminal.created';  payload: { terminalId: string; title: string; pid: number; projectId?: string | null } }
```

- [ ] **Step 2: Add `projectId` to the tab model**

In `src/web/stores/terminals.ts`, extend `TerminalTabInfo`:

```ts
export interface TerminalTabInfo {
  id: string
  title: string
  type: 'standalone' | 'session'
  sessionId?: string
  projectId?: string | null
  pid?: number
}
```

- [ ] **Step 3: Echo `projectId` on the server**

In `src/server/ws/index.ts`, the real `terminal.create` branch (lines ~71-83) calls
`ctx.terminalManager.create(msg.payload.cwd)` (cwd is a positional arg) and sends a
`terminal.created` response. Add `projectId` to that response payload only:

```ts
      case 'terminal.create': {
        const info = ctx.terminalManager.create(msg.payload.cwd)
        const termIds = clientTerminals.get(ws)
        termIds?.add(info.id)
        const response: WsEvent = {
          type: 'terminal.created',
          payload: { terminalId: info.id, title: info.title, pid: info.pid, projectId: msg.payload.projectId ?? null }
        }
        ws.send(JSON.stringify(response))
        break
      }
```
(Keep the existing `console.log` lines if desired; only the `payload` gains `projectId`.)

- [ ] **Step 4: Carry it into the client tab**

In `src/web/lib/ws.ts`, update the `terminal.created` handler:

```ts
          if (msg.type === 'terminal.created') {
            useTerminalsStore.getState().addTab({
              id: msg.payload.terminalId,
              title: msg.payload.title,
              type: 'standalone',
              pid: msg.payload.pid,
              projectId: msg.payload.projectId ?? null
            })
          }
```

- [ ] **Step 5: Filter the panel by active project**

In `src/web/components/TerminalPanel.tsx`:

Add imports at top:
```ts
import { useMatch } from 'react-router-dom'
import { useSessionsStore } from '../stores/sessions'
```

Inside the component, derive the active project and the visible tabs. For
`type: 'session'` tabs the project comes from the session; for standalone tabs it is
on the tab. On non-workspace routes (`activeProjectId == null`) show all tabs.

```ts
  const match = useMatch('/project/:projectId')
  const activeProjectId = match?.params.projectId ?? null
  const sessions = useSessionsStore(s => s.sessions)
  const tabProjectId = (t: TerminalTabInfo): string | null =>
    t.type === 'session'
      ? (sessions.find(s => s.id === t.sessionId)?.projectId ?? t.projectId ?? null)
      : (t.projectId ?? null)
  const visibleTabs = activeProjectId
    ? tabs.filter(t => tabProjectId(t) === activeProjectId)
    : tabs
```

The real `TerminalPanel.tsx` references `tabs` in **three** spots — update each to
`visibleTabs`:
1. The empty/collapsed guard: `if (!panelOpen || tabs.length === 0)` → `visibleTabs.length === 0`.
2. The tab-strip `.map` (line ~79): `tabs.map(tab => …)` → `visibleTabs.map(...)`.
3. The content `.map` (line ~127): `tabs.map(tab => <TerminalTab …/>)` → `visibleTabs.map(...)`.

`TerminalTab` only takes `terminalId` + `isActive`, so its props don't change.
Compute an effective active id so a hidden active tab doesn't blank the panel:
```ts
  const effectiveActiveId = visibleTabs.some(t => t.id === activeTabId)
    ? activeTabId
    : (visibleTabs[0]?.id ?? null)
```
Use `effectiveActiveId` in place of `activeTabId` for the strip highlight and the
`isActive={tab.id === effectiveActiveId}` content check.

Replace `handleNewTerminal` (line ~10) so a shell opened from a workspace inherits the
project cwd (it currently sends `payload: {}`):
```ts
  const handleNewTerminal = () => {
    const project = useProjectsStore.getState().projects.find(p => p.id === activeProjectId)
    sendWsMessage({ type: 'terminal.create', payload: { cwd: project?.path, projectId: activeProjectId } })
  }
```
(add `import { useProjectsStore } from '../stores/projects'`). Leave the drag-resize,
`handleCloseTab`, and `togglePanel` logic untouched.

- [ ] **Step 6: Type-check + manual verify**

Run: `npx tsc --noEmit -p tsconfig.json` → passes (this also clears the transient
errors from Tasks 2 & 5).
Manual (`npm run dev`): open a shell from Project A → it shows in A's panel; switch to
Project B → panel shows B's terminals only; Overview shows all.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/web/stores/terminals.ts src/server/ws/index.ts src/web/lib/ws.ts src/web/components/TerminalPanel.tsx
git commit -m "feat(terminals): scope terminal tabs by project via protocol echo"
```

---

## Task 7: Overview home + project cards

**Files:**
- Create: `src/web/components/ProjectCard.tsx`
- Replace stub: `src/web/pages/Overview.tsx`
- Delete: `src/web/pages/Dashboard.tsx`

- [ ] **Step 1: ProjectCard**

```tsx
// src/web/components/ProjectCard.tsx
import { Link } from 'react-router-dom'
import type { Project, Session } from '../../types'
import { initials, projectHue, formatRelativeTime } from '../lib/format'

export default function ProjectCard({ project, sessions }: { project: Project; sessions: Session[] }) {
  const mine = sessions.filter(s => s.projectId === project.id)
  const running = mine.filter(s => s.state === 'running' || s.state === 'launching').length
  const lastActivity = mine.length
    ? mine.reduce((a, s) => Math.max(a, Date.parse(s.startedAt)), 0)
    : Date.parse(project.createdAt)
  const hue = projectHue(project.id)

  return (
    <Link to={`/project/${project.id}`}
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:shadow-[var(--shadow-modal)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xs font-semibold text-white" style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}>
          {initials(project.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">{project.name}</span>
          <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{project.path}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {running > 0 ? (
          <span className="flex items-center gap-1 text-[var(--color-running)]"><span className="h-2 w-2 rounded-full bg-[var(--color-running)]" /> {running} running</span>
        ) : (
          <span className="text-[var(--color-text-muted)]">idle</span>
        )}
        <span className="text-[var(--color-text-muted)]">· {formatRelativeTime(new Date(lastActivity).toISOString())}</span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Overview page**

```tsx
// src/web/pages/Overview.tsx
import { FolderOpen } from 'lucide-react'
import { useConfigStore } from '../stores/config'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import ProjectCard from '../components/ProjectCard'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'

export default function Overview() {
  const { config, wsConnected } = useConfigStore()
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const { setAddProjectOpen } = useUIStore()

  const sorted = projects.slice().sort((a, b) => {
    const la = sessions.filter(s => s.projectId === a.id).reduce((m, s) => Math.max(m, Date.parse(s.startedAt)), Date.parse(a.createdAt))
    const lb = sessions.filter(s => s.projectId === b.id).reduce((m, s) => Math.max(m, Date.parse(s.startedAt)), Date.parse(b.createdAt))
    return lb - la
  })

  return (
    <>
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-10 py-8">
        <div className="flex flex-col items-center gap-3 pt-6">
          <h1 className="rb-mono text-4xl font-bold tracking-tight text-[var(--color-text-secondary)] sm:text-5xl">RemoteBridge</h1>
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-[var(--color-running)]' : 'bg-[var(--color-stopped)]'}`} />
            {config?.host ?? '127.0.0.1'}:{config?.port ?? ''}
          </span>
        </div>

        <div className="w-full">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent projects</h2>
            <button type="button" onClick={() => setAddProjectOpen(true)} className="rb-ghost-button px-3">
              <FolderOpen size={14} /> Open project
            </button>
          </div>
          {sorted.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] text-center text-xs text-[var(--color-text-muted)]">
              No projects yet. Click “Open project” to add one.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map(p => <ProjectCard key={p.id} project={p} sessions={sessions} />)}
            </div>
          )}
        </div>
      </div>

      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
```

- [ ] **Step 3: Delete the old dashboard**

```bash
git rm src/web/pages/Dashboard.tsx
```

- [ ] **Step 4: Type-check + manual** — `npx tsc --noEmit -p tsconfig.json && npm run dev`. Root shows the home + project cards; clicking a card opens its workspace.

- [ ] **Step 5: Commit**

```bash
git add src/web/components/ProjectCard.tsx src/web/pages/Overview.tsx
git commit -m "feat(web): Overview home with project cards"
```

---

## Task 8: Backend `GET /api/fs/browse`

**Files:**
- Create: `src/server/routes/fs.ts`
- Test: `tests/routes/fs.test.ts`
- Modify: `src/server/index.ts:6-10,27-31` (import + register)

- [ ] **Step 1: Write the failing test**

```ts
// tests/routes/fs.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { listDirectories } from '../../src/server/routes/fs'

let root: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'rb-fs-'))
  await mkdir(join(root, 'alpha'))
  await mkdir(join(root, 'beta'))
  await writeFile(join(root, 'file.txt'), 'x')
})
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

describe('listDirectories', () => {
  it('returns only subdirectories, sorted, with absolute paths', async () => {
    const res = await listDirectories(root)
    expect(res.path).toBe(root)
    expect(res.parent).toBe(dirname(root))
    expect(res.entries.map(e => e.name)).toEqual(['alpha', 'beta'])
    expect(res.entries[0].path).toBe(join(root, 'alpha'))
  })

  it('rejects paths containing null bytes', async () => {
    await expect(listDirectories(root + '\0x')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/routes/fs.test.ts`
Expected: FAIL — `listDirectories` is not exported / module missing.

- [ ] **Step 3: Implement the route + helper**

```ts
// src/server/routes/fs.ts
import type { FastifyInstance } from 'fastify'
import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, parse, resolve } from 'path'

export interface BrowseResult {
  path: string
  parent: string | null
  entries: { name: string; path: string }[]
}

export async function listDirectories(input: string): Promise<BrowseResult> {
  if (input.includes('\0')) throw new Error('Invalid path')
  const path = resolve(input)
  const dirents = await readdir(path, { withFileTypes: true })
  const entries = dirents
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => ({ name: d.name, path: join(path, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const parent = parse(path).root === path ? null : dirname(path)
  return { path, parent, entries }
}

// Envelope matches src/server/routes/projects.ts: { ok: true, data } | reply.code(N).send({ ok: false, error })
export async function fsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/fs/browse', async (request, reply) => {
    const { path } = request.query as { path?: string }
    try {
      return { ok: true, data: await listDirectories(path && path.length ? path : homedir()) }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Directory not found' } })
      if (code === 'EACCES') return reply.code(403).send({ ok: false, error: { code: 'forbidden', message: 'Permission denied' } })
      return reply.code(400).send({ ok: false, error: { code: 'bad_path', message: e instanceof Error ? e.message : 'Invalid path' } })
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/routes/fs.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Register the route (auth-gated)**

In `src/server/index.ts`, add the import next to the other route imports (note `.js`
extension, matching siblings):
```ts
import { fsRoutes } from './routes/fs.js'
```
Register it **inside** the protected block (the `fastify.register(async (app) => { … })`
at lines ~104-111, which adds the `requireSession` + `requireCsrf` hooks). Browse is a
GET, so the CSRF hook skips it and only the session is required:
```ts
    await app.register((a) => projectRoutes(a, manager))
    await app.register(fsRoutes)          // ← add this line
    await app.register(agentRoutes)
    await app.register(configRoutes)
    await app.register((a) => sessionRoutes(a, manager))
```

- [ ] **Step 6: Add the client API**

In `src/web/lib/api.ts`, add inside the `api` object (after `deleteProject`):
```ts
  browseFolder: (path?: string) =>
    request<{ path: string; parent: string | null; entries: { name: string; path: string }[] }>(
      'GET', `/api/fs/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
```

- [ ] **Step 7: Commit**

```bash
git add src/server/routes/fs.ts tests/routes/fs.test.ts src/server/index.ts src/web/lib/api.ts
git commit -m "feat(server): add GET /api/fs/browse directory listing"
```

---

## Task 9: Open Project folder browser modal

**Files:**
- Rewrite: `src/web/components/AddProjectModal.tsx`

Replaces the name+path form with a browser: search filter, recent projects, breadcrumb
navigation, and an "Open this folder" action that creates the project with
`name = basename(path)`.

- [ ] **Step 1: Rewrite the modal**

```tsx
// src/web/components/AddProjectModal.tsx
import { useEffect, useState } from 'react'
import { ChevronLeft, Folder, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '../stores/ui'
import { useProjectsStore } from '../stores/projects'
import { api } from '../lib/api'

function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

export default function AddProjectModal() {
  const { addProjectOpen, setAddProjectOpen } = useUIStore()
  const { projects, addProject } = useProjectsStore()
  const navigate = useNavigate()
  const [cwd, setCwd] = useState('')
  const [parent, setParent] = useState<string | null>(null)
  const [entries, setEntries] = useState<{ name: string; path: string }[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (path?: string) => {
    setBusy(true); setError(null)
    try {
      const res = await api.browseFolder(path)
      setCwd(res.path); setParent(res.parent); setEntries(res.entries); setQuery('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot read folder')
    } finally { setBusy(false) }
  }

  useEffect(() => { if (addProjectOpen) load() }, [addProjectOpen])

  if (!addProjectOpen) return null

  const close = () => setAddProjectOpen(false)
  const filtered = entries.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))

  const openExisting = (id: string) => { close(); navigate(`/project/${id}`) }

  const openThisFolder = async () => {
    setBusy(true); setError(null)
    try {
      const project = await api.createProject({ name: basename(cwd), path: cwd, env: {} })
      addProject(project)
      close()
      navigate(`/project/${project.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="Open project"
        className="rb-safe-bottom flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)] sm:max-h-[80dvh] sm:max-w-lg sm:rounded-[var(--radius-xl)]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Open project</h2>
          <button type="button" onClick={close} className="rb-icon-button" aria-label="Close" title="Close"><X size={16} /></button>
        </div>

        <div className="border-b border-[var(--color-border-subtle)] p-3">
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2">
            <Search size={14} className="text-[var(--color-text-muted)]" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search folders" autoFocus
              className="w-full bg-transparent py-2 text-sm text-[var(--color-text-primary)] outline-none" />
          </div>
        </div>

        {projects.length > 0 && (
          <div className="border-b border-[var(--color-border-subtle)] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Recent projects</p>
            <div className="space-y-1">
              {projects.slice(0, 3).map(p => (
                <button key={p.id} type="button" onClick={() => openExisting(p.id)}
                  className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left hover:bg-[var(--color-bg-hover)]">
                  <Folder size={15} className="shrink-0 text-[var(--color-text-muted)]" />
                  <span className="rb-mono min-w-0 truncate text-xs text-[var(--color-text-secondary)]">{p.path}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2">
          <button type="button" disabled={!parent || busy} onClick={() => parent && load(parent)}
            className="rb-icon-button h-7 min-h-7 min-w-7 disabled:opacity-30" aria-label="Up one folder" title="Up">
            <ChevronLeft size={15} />
          </button>
          <span className="rb-mono min-w-0 truncate text-xs text-[var(--color-text-secondary)]">{cwd || '…'}</span>
        </div>

        {error && <p className="px-4 pb-1 text-xs text-[var(--color-failed)]">{error}</p>}

        <div className="rb-scrollbar min-h-[120px] flex-1 overflow-y-auto px-3 pb-2">
          {filtered.map(e => (
            <button key={e.path} type="button" onClick={() => load(e.path)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left hover:bg-[var(--color-bg-hover)]">
              <Folder size={15} className="shrink-0 text-[var(--color-accent)]" />
              <span className="truncate text-sm text-[var(--color-text-primary)]">{e.name}</span>
            </button>
          ))}
          {!busy && filtered.length === 0 && <p className="px-2 py-4 text-center text-xs text-[var(--color-text-muted)]">No subfolders</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] p-4">
          <button type="button" onClick={close} className="rb-ghost-button">Cancel</button>
          <button type="button" onClick={openThisFolder} disabled={busy || !cwd} className="rb-primary-button disabled:opacity-50">
            {busy ? 'Working…' : 'Open this folder'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + manual** — `npx tsc --noEmit -p tsconfig.json && npm run dev`. Open the modal from the rail `+` and the Overview "Open project": it lists folders, navigates in/up, search filters, "Open this folder" creates the project and routes into it.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/AddProjectModal.tsx
git commit -m "feat(web): folder-browser Open Project modal"
```

---

## Task 10: E2E coverage + full build

**Files:**
- Create: `tests/e2e/workspace.spec.ts`

> The existing e2e tests log in first; reuse that pattern. If they rely on a helper,
> import it the same way `tests/e2e/responsive-ui.spec.ts` does. The assertions below
> are written against the dev server on `http://127.0.0.1:5173` (see playwright.config).

- [ ] **Step 1: Write the e2e spec**

```ts
// tests/e2e/workspace.spec.ts
import { test, expect } from '@playwright/test'

// Assumes an authenticated session is established the same way responsive-ui.spec.ts does.
// If that file defines a login helper, import and call it in a beforeEach here too.

test('sidebar collapse state persists across reload', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /collapse sidebar|expand sidebar/i })
  await toggle.click()
  await page.reload()
  // After reload the toggle still reflects the persisted (collapsed) state.
  await expect(page.getByRole('button', { name: /expand sidebar/i })).toBeVisible()
})

test('overview shows project cards and navigates to a workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Recent projects' })).toBeVisible()
  const firstCard = page.locator('a[href^="/project/"]').first()
  if (await firstCard.count()) {
    await firstCard.click()
    await expect(page).toHaveURL(/\/project\//)
    await expect(page.getByText(/Sessions \(/)).toBeVisible()
  }
})

test('open project modal lists folders', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /open project/i }).click()
  await expect(page.getByRole('dialog', { name: 'Open project' })).toBeVisible()
  await expect(page.getByPlaceholder('Search folders')).toBeVisible()
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `npx playwright test tests/e2e/workspace.spec.ts`
Expected: PASS (tolerant of empty project lists).

- [ ] **Step 3: Full unit suite + production build**

Run: `npm test`
Expected: PASS (format + fs + existing suites).

Run: `npm run build`
Expected: server (`tsup`) and web (`vite build`) both succeed with no TS errors.

- [ ] **Step 4: Manual smoke with the run skill**

Launch the app, confirm: rail collapse, Overview cards, workspace session rows show
`#id` + time, Restart button is normal width, terminals are project-scoped, folder
browser opens a project.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/workspace.spec.ts
git commit -m "test(e2e): workspace navigation, collapse persistence, folder browser"
```

---

## Self-review notes (for the implementer)

- **Type ordering:** `SessionRow` (Task 2) and `ProjectWorkspace` (Task 5) reference
  `TerminalTabInfo.projectId` and the `terminal.create` `projectId` payload, both
  added in Task 6. Expect transient `tsc` errors until Task 6; do not "fix" them
  earlier by other means. If using subagent-driven execution, run Task 6 immediately
  after Task 5 and type-check once at Task 6 Step 6.
- **Naming consistency:** the project tile component is `ProjectCard` (Overview) and
  the rail entry is `ProjectEntry` (inside Sidebar) — distinct on purpose.
  `compareSessions`, `projectHue`, `initials`, `shortId`, `formatRelativeTime`,
  `formatDuration` are the exact helper names from Task 1; use them verbatim.
- **No `Session` model changes** this plan. `branch`/`task`/`title` remain deferred
  (spec "Deferred"). Do not invent fields.
- **Trust boundary:** `fs.browse` is read-only and gated by the same auth as every
  `/api` route (ADR-0003). Do not add a separate allow-list; do not expose writes.
```
