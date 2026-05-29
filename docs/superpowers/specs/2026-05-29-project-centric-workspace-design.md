# Project-Centric Workspace UI — Design Spec

**Date:** 2026-05-29
**Status:** Draft (awaiting review)
**Author:** sowndev + Claude

## Problem

The dashboard renders every session as an identical card. The root cause is in the
data, not the layout: `SessionCard` shows only `projectName` + `agentId`
([SessionCard.tsx:79-80](../../../src/web/components/SessionCard.tsx)), and the
`Session` type ([types.ts:13-24](../../../src/types.ts)) has **no** `name`, `task`,
or `branch`. When 8 sessions share the same project and agent, all 8 cards are
literally indistinguishable.

Secondary issues:
- Per-session identity that *does* exist (`id`, `startedAt`, `state`) is discarded.
- The session list is global and flat; it does not scale past one screen.
- Terminals are global and unscoped (`Terminal 2`, `Terminal 3`), unrelated to any project.
- Sidebar click means "create session", not "select project" — surprising.
- The Restart button stretches via `sm:flex-1` and renders as an empty-looking box.
- Header repeats the session count three ways ("Active Sessions" / "N tracked" / badge).

## Goal

Reorganize the app around a **project = workspace** model. Selecting a project shows
that project's sessions *and* terminals together, with each session made
identifiable. Keep a global Overview for cross-project visibility.

Non-goals (this iteration): adding `task`/`branch`/`name` to the `Session` model
(deferred to a Phase 2 — see Deferred section). Everything below is achievable
frontend-only.

## Architecture

### Navigation: URL is the source of truth
Use the existing `react-router` ([App.tsx:42-46](../../../src/web/App.tsx)):

- `/` → **Overview** (all projects, compact global list)
- `/project/:projectId` → **Workspace** for one project

`activeProjectId` comes from `useParams()` — **not** added to a store. On app load,
redirect `/` consumers' "last opened project" via a localStorage preference (falls
back to Overview when none/empty). This keeps refresh, back-button, and shareable
links correct.

### State: keep stores flat, derive with selectors
- `useSessionsStore.sessions` stays a flat `Session[]`. Per-project views are
  **derived** (`sessions.filter(s => s.projectId === projectId)`), never duplicated
  into per-project buckets.
- `useTerminalsStore.TerminalTabInfo` gains a `projectId: string | null` field — a
  single, explicit owner. **Do not** infer a terminal's project by matching `cwd`
  strings.
  - `type: 'session'` terminals: `projectId = session.projectId` (joined at creation).
  - `type: 'standalone'` terminals (the `+ Shell` button): set `projectId` +
    `cwd = project.path` when created inside a workspace.
- `useUIStore` gains `sidebarCollapsed: boolean` (persisted to localStorage) and
  `lastProjectId: string | null` (persisted).

### Component boundaries
| Component | Responsibility |
|-----------|----------------|
| `Sidebar` (rewrite) | Icon rail: Overview, project avatars, add, settings/help, collapse toggle |
| `OverviewPage` (rename of Dashboard) | Compact global session list, grouped by project |
| `ProjectWorkspace` (new) | SESSIONS + TERMINALS panes for one project |
| `SessionRow` (refactor of SessionCard) | Presentational row, dumb |
| `TerminalPanel` (adjust) | Filter tabs by active project |

Keep `SessionRow` and `TerminalTab` presentational (props in, no fetching).

## Components & Behavior

### Sidebar — icon rail, collapsible
```
┌────┐  collapsed (w-14)        ┌──────────────────┐  expanded (w-60)
│ ⊞  │  Overview                │ ⊞  Overview       │
│[A]•│  active project + dot    │[A] agent-bridge  •│  name + running dot
│ O  │  other project           │[O] one-lotte      │
│ +  │  Add project             │ +  Add project    │
│ ⚙  │  Settings (bottom)       │ ⚙  Settings       │
│ ?  │  Help                    │ ?  Help           │
└────┘                          └──────────────────┘
```
- **Avatar = 2 initials + color hashed from `project.id`** (stable per project), so
  same-initial projects stay visually distinct.
- **Running badge**: small dot on the avatar when the project has a
  `launching`/`running` session.
- **Tooltip on hover** (always, even when expanded): full name + path.
- **Toggle button** (top, the panel icon) flips `sidebarCollapsed`; persisted.
  Optional `Ctrl/Cmd+B` shortcut.
- **Click avatar → navigate** to `/project/:id`. **`+` → Add project**. Launching a
  session moves *inside* the workspace (`+ New session`), decoupled from selection.
- Mobile: unchanged drawer overlay; selecting a project closes the drawer.

### ProjectWorkspace (`/project/:projectId`)
Header: project name (large) + path + (Phase 2) branch + `+ New session`.

- **SESSIONS pane**: `projectSessions` sorted by
  `STATE_RANK {running:0, launching:1, failed:2, stopped:3}`, then `startedAt` desc.
  Each `SessionRow` shows: status icon · `#shortId` · `agentId` · relative time
  (`running 12m` / `ran 5m, 2h ago`) · state-appropriate actions.
- **TERMINALS pane**: terminal tabs where `projectId === projectId`. `+ Shell`
  creates a shell with `cwd = project.path`, tagged with this project.
- Empty states preserved (ADR-0002: sessions do not survive restart).

### OverviewPage (`/`) — landing / home
Styled as a home screen (reference: opencode onboarding):
- Centered wordmark + connection status (`● 127.0.0.1:4091`, reuses the existing
  Connected indicator from Header).
- **Recent projects as a card grid**, not flat lines. Responsive
  `1 / 2 / 3` columns. Each `ProjectCard` shows:
  - color-hashed avatar (same hash as the rail) + project name
  - `path` (mono, muted)
  - last activity relative time (max `startedAt` of its sessions, else
    `project.createdAt`)
  - running indicator: `● N running` when it has live sessions, else muted `idle`
  - whole card is a link → `/project/:id`; hover lift + border-accent.
- `Open project` / `+ Add project` action in the section header.
- Sort cards by last activity desc.

A live cross-project session list is **not** the primary Overview content; project
cards are. (Per-project session detail lives in the Workspace.)

### SessionRow (refactor of SessionCard)
- Drop the project name from the row (it lives in the workspace/group header).
- Add `#shortId` + relative time from `startedAt`/`stoppedAt`.
- **Fix Restart**: remove `sm:flex-1`; right-align an even-sized action cluster.
- Preserve all existing logic (stop/restart/remove/openTerminal) and `aria-label`s.

### Helpers (`src/web/lib/format.ts`, new)
`formatRelativeTime(iso)`, `formatDuration(start, stop)`, `shortId(id)`,
`projectColor(id)`. Pure, unit-testable.

## Data flow
1. Stores stay flat (`sessions`, terminal `tabs`).
2. Route param `projectId` selects the active project.
3. Views filter flat stores by `projectId` via memoized selectors.
4. Terminal tabs carry `projectId`; the panel filters on it.
5. UI preferences (`sidebarCollapsed`, `lastProjectId`, collapsed groups) persist to
   localStorage; **no session/terminal data is persisted** (ADR-0002).

## Invariants to preserve
- **ADR-0002**: sessions do not survive restart → handle empty Overview/Workspace.
- **Logs invariant** ([types.ts:75-77](../../../src/types.ts)): `session.updated`
  never carries `logs`; refactors must not spread `logs` into updates.
- Existing responsive + a11y investment (recent commits) stays intact.

## Error handling
- Unknown/deleted `:projectId` → redirect to Overview with a transient notice.
- Project with deleted record but live session → fall back to `projectId` string
  (existing behavior in SessionCard).

## Testing
- Unit: `format.ts` helpers (relative time boundaries, duration, color stability).
- Component: `SessionRow` renders identity fields; sort order by state then time.
- E2E (extend [responsive-ui.spec.ts](../../../tests/e2e/responsive-ui.spec.ts)):
  select project → workspace shows only its sessions + terminals; collapse toggle
  persists across reload; `+ Shell` opens in `project.path`.

## Deferred (Phase 2, requires backend)
- `branch`: derive from `project.path` via git on the server; add to `Session`.
- `title`/`task`: new field set at launch (touches types.ts, manager.ts, routes).

## Scope
Single implementation plan. Frontend-only. No backend changes this iteration.
