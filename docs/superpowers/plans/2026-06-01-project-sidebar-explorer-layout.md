# Project Sidebar And Explorer Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable project sidebar with project detail, delete, and display-order controls, then fix the Explorer/Sessions split so Sessions moves up only when Explorer is collapsed.

**Architecture:** Keep project CRUD server-owned and use the existing `DELETE /api/projects/:id` endpoint for deletion. Store sidebar expansion and project display order as frontend UI preferences, with project order persisted in `localStorage` because the Phase 1 `Project` model has no server-side sort/index field. Keep the Explorer and Sessions layout local to `PrimarySidebar` so file-tree height cannot push Sessions around while Explorer is open.

**Tech Stack:** React 18, Zustand, React Router, Tailwind utilities with existing CSS variables, Lucide React, Playwright UI tests.

---

## File Structure

- Modify `src/web/stores/ui.ts`
  - Add `projectSidebarExpanded`, `projectOrder`, and modal state for confirming project deletion.
  - Persist `projectOrder` to `localStorage`.
- Modify `src/web/components/ActivityBar.tsx`
  - Add expand/collapse icon button.
  - Render collapsed avatar rail as today.
  - Render expanded project rows with name/path/details, delete button, and move up/down controls.
- Create `src/web/components/DeleteProjectModal.tsx`
  - Confirm project deletion.
  - Block obvious live-session deletes in the client before hitting the API.
  - Call `api.deleteProject()`, update project store, clean local order, and navigate away if deleting the current project.
- Modify `src/web/components/Layout.tsx`
  - Mount `DeleteProjectModal`.
- Modify `src/web/components/PrimarySidebar.tsx`
  - Lift Explorer open state into `PrimarySidebar`.
  - Make Explorer body scroll inside a fixed open region.
  - Let Sessions fill the sidebar only when Explorer is collapsed.
- Modify `tests/e2e/responsive-ui.spec.ts`
  - Add Playwright coverage for expanded sidebar project controls.
  - Add Playwright coverage for Explorer collapse causing Sessions to move up.

---

### Task 1: UI Store State For Sidebar Expansion, Project Order, And Delete Modal

**Files:**
- Modify: `src/web/stores/ui.ts`

- [ ] **Step 1: Add failing store expectations by reading the existing UI store contract**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS before changes. This establishes the current type baseline.

- [ ] **Step 2: Extend `UIStore` with project sidebar state**

In `src/web/stores/ui.ts`, replace the interface with these additional fields:

```ts
interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  deleteProjectId: string | null
  projectSidebarExpanded: boolean
  projectOrder: string[]
  toasts: Toast[]
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
  setDeleteProjectId: (id: string | null) => void
  setProjectSidebarExpanded: (expanded: boolean) => void
  toggleProjectSidebarExpanded: () => void
  setProjectOrder: (ids: string[]) => void
  moveProject: (id: string, direction: -1 | 1) => void
  removeProjectFromOrder: (id: string) => void
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}
```

- [ ] **Step 3: Add localStorage helpers above `useUIStore`**

```ts
const PROJECT_ORDER_KEY = 'remotebridge.projectOrder'

function readProjectOrder(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PROJECT_ORDER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeProjectOrder(ids: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(ids))
}
```

- [ ] **Step 4: Add initial values and setters to the Zustand store**

Inside `useUIStore`, add:

```ts
deleteProjectId: null,
projectSidebarExpanded: false,
projectOrder: readProjectOrder(),
setDeleteProjectId: (id) => set({ deleteProjectId: id }),
setProjectSidebarExpanded: (expanded) => set({ projectSidebarExpanded: expanded }),
toggleProjectSidebarExpanded: () => set(state => ({ projectSidebarExpanded: !state.projectSidebarExpanded })),
setProjectOrder: (ids) => {
  writeProjectOrder(ids)
  set({ projectOrder: ids })
},
moveProject: (id, direction) => set(state => {
  const order = state.projectOrder.length ? [...state.projectOrder] : []
  const index = order.indexOf(id)
  if (index === -1) return state
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= order.length) return state
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  writeProjectOrder(next)
  return { projectOrder: next }
}),
removeProjectFromOrder: (id) => set(state => {
  const next = state.projectOrder.filter(projectId => projectId !== id)
  writeProjectOrder(next)
  return { projectOrder: next }
}),
```

- [ ] **Step 5: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/stores/ui.ts
git commit -m "feat: add project sidebar ui state"
```

---

### Task 2: Expanded Project Sidebar With Details And Reorder Controls

**Files:**
- Modify: `src/web/components/ActivityBar.tsx`

- [ ] **Step 1: Add a failing Playwright expectation for the expanded sidebar**

In `tests/e2e/responsive-ui.spec.ts`, add this test after `VS Code shell: title bar, activity bar and exposure warning`:

```ts
test('Project sidebar expands to show project details and reorder controls', async ({ page }) => {
  await openDashboard(page)

  const sidebar = page.getByRole('complementary', { name: 'Projects' })
  await expect(sidebar).toBeVisible()
  await page.getByRole('button', { name: 'Expand project sidebar' }).click()

  await expect(sidebar.getByText('api-service')).toBeVisible()
  await expect(sidebar.getByText('/home/user/workplace/personal/api-service')).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Move api-service down' })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Delete api-service' })).toBeVisible()

  const expandedBox = await sidebar.boundingBox()
  expect(expandedBox).not.toBeNull()
  expect(expandedBox!.width).toBeGreaterThan(200)

  await page.getByRole('button', { name: 'Collapse project sidebar' }).click()
  const collapsedBox = await sidebar.boundingBox()
  expect(collapsedBox).not.toBeNull()
  expect(collapsedBox!.width).toBeLessThanOrEqual(64)
})
```

- [ ] **Step 2: Run the failing UI test**

Run:

```bash
npm run test:responsive -- --grep "Project sidebar expands"
```

Expected: FAIL because `Expand project sidebar` does not exist.

- [ ] **Step 3: Update imports in `ActivityBar.tsx`**

Replace the Lucide import with:

```ts
import { ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen, Plus, Settings, HelpCircle, Trash2 } from 'lucide-react'
```

- [ ] **Step 4: Read sidebar state and derive ordered projects**

Inside `ActivityBar`, replace the existing UI store line:

```ts
const setAddProjectOpen = useUIStore(s => s.setAddProjectOpen)
```

with:

```ts
const {
  projectSidebarExpanded,
  projectOrder,
  setAddProjectOpen,
  setDeleteProjectId,
  setProjectOrder,
  toggleProjectSidebarExpanded,
  moveProject
} = useUIStore()
```

Below `show`, add:

```ts
const knownIds = projects.map(p => p.id)
const normalizedOrder = [
  ...projectOrder.filter(id => knownIds.includes(id)),
  ...knownIds.filter(id => !projectOrder.includes(id))
]
if (normalizedOrder.join('\0') !== projectOrder.join('\0')) {
  queueMicrotask(() => setProjectOrder(normalizedOrder))
}
const orderedProjects = normalizedOrder
  .map(id => projects.find(p => p.id === id))
  .filter((p): p is (typeof projects)[number] => Boolean(p))
```

- [ ] **Step 5: Replace the `<aside>` class and add the expand/collapse button**

Use this class on the root aside:

```tsx
className={`flex shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] py-2 transition-[width] duration-200 ease-[var(--ease-standard)] ${
  projectSidebarExpanded ? 'w-72' : 'w-12 items-center'
}`}
```

Add this button as the first child inside `<aside>`:

```tsx
<button
  type="button"
  onClick={toggleProjectSidebarExpanded}
  aria-label={projectSidebarExpanded ? 'Collapse project sidebar' : 'Expand project sidebar'}
  title={projectSidebarExpanded ? 'Collapse project sidebar' : 'Expand project sidebar'}
  className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
>
  {projectSidebarExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
</button>
```

- [ ] **Step 6: Split collapsed and expanded project rendering**

Use `orderedProjects.map(...)` instead of `projects.map(...)`.

Collapsed mode keeps the current `NavLink` avatar UI.

Expanded mode renders:

```tsx
<NavLink
  key={p.id}
  to={`/project/${p.id}`}
  title={`${p.name}\n${p.path}`}
  className={({ isActive }) =>
    `group relative mx-2 flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border px-2 py-2 text-left transition-colors ${
      isActive
        ? 'border-[var(--color-accent)] bg-[var(--color-accent-glow)]'
        : 'border-transparent hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)]'
    }`
  }
>
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xs font-semibold text-white" style={{ backgroundColor: projectColor(p.id) }}>
    {initials(p.name)}
  </span>
  <span className="min-w-0 flex-1">
    <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{p.name}</span>
    <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{p.path}</span>
    <span className="mt-1 block text-[11px] text-[var(--color-text-secondary)]">
      {running(p.id) ? 'active session' : 'idle'}
    </span>
  </span>
  <span className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
    <button type="button" onClick={(e) => { e.preventDefault(); moveProject(p.id, -1) }} aria-label={`Move ${p.name} up`} title="Move up" className="rb-icon-button h-6 w-6">
      <ChevronUp size={13} />
    </button>
    <button type="button" onClick={(e) => { e.preventDefault(); moveProject(p.id, 1) }} aria-label={`Move ${p.name} down`} title="Move down" className="rb-icon-button h-6 w-6">
      <ChevronDown size={13} />
    </button>
    <button type="button" onClick={(e) => { e.preventDefault(); setDeleteProjectId(p.id) }} aria-label={`Delete ${p.name}`} title="Delete project" className="rb-icon-button h-6 w-6 hover:text-[var(--color-destructive)]">
      <Trash2 size={13} />
    </button>
  </span>
</NavLink>
```

- [ ] **Step 7: Keep Settings and Help aligned in both modes**

For the bottom action container, use:

```tsx
<div className={`flex border-t border-[var(--color-border-subtle)] pt-2 ${projectSidebarExpanded ? 'mx-2 flex-row justify-between' : 'flex-col items-center gap-1'}`}>
```

- [ ] **Step 8: Run focused UI test**

Run:

```bash
npm run test:responsive -- --grep "Project sidebar expands"
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/web/components/ActivityBar.tsx tests/e2e/responsive-ui.spec.ts
git commit -m "feat: add expandable project sidebar"
```

---

### Task 3: Delete Project Confirmation Modal

**Files:**
- Create: `src/web/components/DeleteProjectModal.tsx`
- Modify: `src/web/components/Layout.tsx`
- Modify: `tests/e2e/responsive-ui.spec.ts`

- [ ] **Step 1: Add DELETE mocking and a failing modal test**

In `mockRemoteBridgeApi`, replace the `page.route('**/api/projects', ...)` handler with a method-aware handler:

```ts
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

await page.route('**/api/projects', route => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(ok(projects))
}))

await page.route(/\/api\/projects\/[^/]+$/, route => {
  const method = route.request().method()
  const id = route.request().url().split('/').pop()
  if (method === 'DELETE') {
    projects = projects.filter(p => p.id !== id)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ok(null)) })
  }
  return route.fallback()
})
```

Add this test:

```ts
test('Expanded project sidebar can delete an idle project after confirmation', async ({ page }) => {
  await openDashboard(page)
  await page.getByRole('button', { name: 'Expand project sidebar' }).click()

  await page.getByRole('button', { name: 'Delete frontend-dashboard-with-long-name' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete project' })).toBeVisible()
  await expect(page.getByText('frontend-dashboard-with-long-name')).toBeVisible()

  await page.getByRole('button', { name: 'Delete project permanently' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete project' })).toBeHidden()
  await expect(page.getByText('frontend-dashboard-with-long-name')).toBeHidden()
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:responsive -- --grep "delete an idle project"
```

Expected: FAIL because the modal is not mounted.

- [ ] **Step 3: Create `DeleteProjectModal.tsx`**

```tsx
import { useNavigate, useMatch } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { api } from '../lib/api'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'

export default function DeleteProjectModal() {
  const navigate = useNavigate()
  const match = useMatch('/project/:projectId')
  const { deleteProjectId, setDeleteProjectId, addToast, removeProjectFromOrder } = useUIStore()
  const { projects, removeProject } = useProjectsStore()
  const sessions = useSessionsStore(s => s.sessions)
  const project = projects.find(p => p.id === deleteProjectId)

  if (!deleteProjectId || !project) return null

  const liveSessions = sessions.filter(s =>
    s.projectId === project.id && (s.state === 'launching' || s.state === 'running')
  )
  const close = () => setDeleteProjectId(null)

  const confirm = async () => {
    if (liveSessions.length > 0) {
      addToast('Stop running sessions before deleting this project.')
      return
    }

    try {
      await api.deleteProject(project.id)
      removeProject(project.id)
      removeProjectFromOrder(project.id)
      close()
      if (match?.params.projectId === project.id) navigate('/', { replace: true })
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete project')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete project"
        className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle size={17} className="shrink-0 text-[var(--color-warning)]" />
            <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">Delete project</h2>
          </div>
          <button type="button" onClick={close} className="rb-icon-button" aria-label="Close delete project" title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-[var(--color-text-secondary)]">
          <p>
            Delete <span className="font-medium text-[var(--color-text-primary)]">{project.name}</span> from RemoteBridge.
          </p>
          <p className="rb-mono break-all rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] px-3 py-2 text-[11px] text-[var(--color-text-code)]">
            {project.path}
          </p>
          {liveSessions.length > 0 && (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-warning)]">
              {liveSessions.length} session(s) are still launching or running. Stop them before deleting this project.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border-subtle)] px-4 py-3">
          <button type="button" onClick={close} className="rb-ghost-button">Cancel</button>
          <button
            type="button"
            onClick={confirm}
            disabled={liveSessions.length > 0}
            className="rb-primary-button bg-[var(--color-destructive)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete project permanently
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Mount the modal in `Layout.tsx`**

Add import:

```ts
import DeleteProjectModal from './DeleteProjectModal'
```

Render it beside the other portals:

```tsx
<DeleteProjectModal />
```

- [ ] **Step 5: Run focused UI test**

Run:

```bash
npm run test:responsive -- --grep "delete an idle project"
```

Expected: PASS.

- [ ] **Step 6: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/web/components/DeleteProjectModal.tsx src/web/components/Layout.tsx src/web/stores/ui.ts tests/e2e/responsive-ui.spec.ts
git commit -m "feat: add project delete confirmation"
```

---

### Task 4: Explorer Collapse Should Move Sessions Up, Explorer Open Should Stay Fixed

**Files:**
- Modify: `src/web/components/PrimarySidebar.tsx`
- Modify: `tests/e2e/responsive-ui.spec.ts`

- [ ] **Step 1: Add a failing Playwright layout test**

Add this test to `tests/e2e/responsive-ui.spec.ts`:

```ts
test('Collapsing Explorer moves Sessions up while open Explorer keeps a fixed region', async ({ page }) => {
  await openDashboard(page)
  await openProject(page)

  const explorerButton = page.getByRole('button', { name: 'Explorer' })
  const sessionsButton = page.getByRole('button', { name: 'Sessions' })
  const openTop = (await sessionsButton.boundingBox())!.top

  await explorerButton.click()
  const collapsedTop = (await sessionsButton.boundingBox())!.top
  expect(collapsedTop).toBeLessThan(openTop)

  await explorerButton.click()
  const reopenedTop = (await sessionsButton.boundingBox())!.top
  expect(Math.abs(reopenedTop - openTop)).toBeLessThanOrEqual(2)
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test:responsive -- --grep "Collapsing Explorer"
```

Expected: FAIL because the existing wrapper keeps a large empty Explorer region when collapsed.

- [ ] **Step 3: Refactor `Section` to be controlled by parent layout**

In `PrimarySidebar.tsx`, replace `Section` with:

```tsx
function Section({ title, open, onOpenChange, actions, children }: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-1 hover:text-[var(--color-text-primary)]"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{title}
        </button>
        {open && actions}
      </div>
      {open && children}
    </div>
  )
}
```

- [ ] **Step 4: Add controlled Explorer/Sessions state**

Inside `PrimarySidebar`, add:

```ts
const [explorerOpen, setExplorerOpen] = useState(true)
const [sessionsOpen, setSessionsOpen] = useState(true)
```

- [ ] **Step 5: Replace the two section wrappers**

Replace the Explorer wrapper with:

```tsx
<div className={`flex min-h-0 flex-col border-t border-[var(--color-border-subtle)] ${explorerOpen ? 'basis-[58%] max-h-[65%]' : 'shrink-0'}`}>
  <Section title="Explorer" open={explorerOpen} onOpenChange={setExplorerOpen} actions={
    <button type="button" onClick={() => setTreeKey(k => k + 1)} title="Refresh" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors">
      <RefreshCw size={12} />
    </button>
  }>
    <div className="min-h-0 flex-1 overflow-hidden">
      <FileTree key={treeKey} project={project} />
    </div>
  </Section>
</div>
```

Replace the Sessions wrapper with:

```tsx
<div className="flex min-h-0 flex-1 flex-col border-t border-[var(--color-border-subtle)]">
  <Section title="Sessions" open={sessionsOpen} onOpenChange={setSessionsOpen} actions={
    <button type="button" onClick={openShell} title="Shell here" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors">
      <TerminalSquare size={12} />
    </button>
  }>
    <div className="rb-scrollbar min-h-0 flex-1 overflow-y-auto">
      {mine.length === 0 ? (
        <p className="px-3 py-4 text-xs text-[var(--color-text-muted)]">No sessions yet.</p>
      ) : (
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {mine.map(s => <SessionRow key={s.id} session={s} compact />)}
        </div>
      )}
    </div>
  </Section>
</div>
```

- [ ] **Step 6: Run focused layout test**

Run:

```bash
npm run test:responsive -- --grep "Collapsing Explorer"
```

Expected: PASS.

- [ ] **Step 7: Run broader responsive UI tests**

Run:

```bash
npm run test:responsive
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/web/components/PrimarySidebar.tsx tests/e2e/responsive-ui.spec.ts
git commit -m "fix: keep sessions stable under explorer"
```

---

### Task 5: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 2: Unit and route tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Responsive Playwright tests**

Run:

```bash
npm run test:responsive
```

Expected: PASS.

- [ ] **Step 4: Manual visual check**

Run:

```bash
npm run dev
```

Open the Vite URL shown by the terminal. Check:

- Collapsed project sidebar is still a narrow icon rail.
- Expanded project sidebar shows project name, path, idle/active state, up/down controls, and delete.
- Delete modal blocks live projects and deletes idle projects.
- Explorer open keeps Sessions fixed below the Explorer region.
- Explorer collapsed moves Sessions directly below the Explorer header.
- No horizontal overflow at 1280px desktop and 375px mobile.

- [ ] **Step 5: Commit verification-only test changes if any**

If verification required changes to tests or code:

```bash
git add src/web tests/e2e/responsive-ui.spec.ts
git commit -m "test: cover project sidebar interactions"
```

If no files changed, do not create an empty commit.

---

## Self-Review

**Spec coverage:** This plan covers FR1 project deletion through the existing API and keeps H15 intact by checking live sessions in the client while still relying on server-side `project_in_use` enforcement. It does not add providers or change agent orchestration, so it stays inside Phase 1 boundaries.

**Placeholder scan:** The plan contains concrete file paths, commands, expected outcomes, and code snippets for each implementation step.

**Type consistency:** `deleteProjectId`, `projectSidebarExpanded`, `projectOrder`, `moveProject`, and `removeProjectFromOrder` are introduced in Task 1 and reused consistently in Tasks 2 and 3.
