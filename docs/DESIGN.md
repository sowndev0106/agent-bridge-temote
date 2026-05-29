# RemoteBridge — Frontend Design

## Overview

Single Page Application built with **React 18 + Vite + TailwindCSS**.
Served by the Fastify backend as static files from the `dist/` build output.
State management via **Zustand**. Realtime updates via WebSocket hook.

---

## Page Map

```
/login      LoginPage
/           Dashboard  (auth required)
/settings   SettingsPage (auth required)
```

---

## Component Tree

```
App
├── LoginPage
└── AuthGuard
    └── Layout
        ├── Header
        │   ├── Logo + app name
        │   ├── ConnectionBadge  (● Connected / ○ Disconnected)
        │   ├── NetworkWarningBadge  (shown when host = 0.0.0.0)
        │   ├── [⚙ Settings] link
        │   └── [Logout] button
        ├── Sidebar
        │   ├── SectionTitle "PROJECTS"
        │   ├── ProjectList
        │   │   └── ProjectCard (× N)
        │   └── AddProjectButton
        └── MainContent
            ├── SectionTitle "ACTIVE SESSIONS"
            ├── SessionGrid
            │   └── SessionCard (× N)
            └── EmptyState  (when no sessions)

AddProjectModal     (portal)
EditProjectModal    (portal)
AgentSelectorModal  (portal)
LogsDrawer          (portal, slide-in)
SettingsPage
```

---

## Layout Mockup — Dashboard

```
┌──────────────────────────────────────────────────────────────────────┐
│  🌉 RemoteBridge   ● Connected   ⚠ Public (0.0.0.0)  [⚙]  [Logout] │
├─────────────────────┬────────────────────────────────────────────────┤
│ PROJECTS            │ ACTIVE SESSIONS                                 │
│                     │                                                 │
│ ┌─────────────────┐ │ ┌──────────────────────┐ ┌──────────────────┐ │
│ │ my-api          │ │ │ my-api               │ │ frontend-app     │ │
│ │ ~/projects/…    │ │ │ claude  ● Running    │ │ gemini ◌ Launch  │ │
│ │ [▶ Launch]  […] │ │ │                      │ │                  │ │
│ └─────────────────┘ │ │ [Open Remote Control]│ │ [▶ Launch]       │ │
│                     │ │ [■ Stop]  [📋 Logs]  │ │                  │ │
│ ┌─────────────────┐ │ └──────────────────────┘ └──────────────────┘ │
│ │ frontend-app    │ │                                                 │
│ │ ~/projects/…    │ │ ┌──────────────────────┐                       │
│ │ [▶ Launch]  […] │ │ │ data-pipeline        │                       │
│ └─────────────────┘ │ │ opencode  ⚠ Failed   │                       │
│                     │ │ No link found (30s)  │                       │
│ ┌─────────────────┐ │ │ [↺ Restart] [✕ Del] │                       │
│ │ data-pipeline   │ │ └──────────────────────┘                       │
│ │ ~/projects/…    │ │                                                 │
│ │ [▶ Launch]  […] │ │                                                 │
│ └─────────────────┘ │                                                 │
│                     │                                                 │
│ [+ Add Project]     │                                                 │
└─────────────────────┴────────────────────────────────────────────────┘
```

---

## Session Card States

### LAUNCHING

```
┌──────────────────────────────────┐
│ my-api              claude       │
│ ◌ Launching…                     │
│ ▓▓▓▓▓░░░░░░░░░░ waiting for link │
└──────────────────────────────────┘
```

### RUNNING

```
┌──────────────────────────────────┐
│ my-api              claude       │
│ ● Running                        │
│                                  │
│ ┌──────────────────────────────┐ │
│ │  Open Remote Control  ↗      │ │
│ └──────────────────────────────┘ │
│ [■ Stop]          [📋 Logs]      │
└──────────────────────────────────┘
```

### FAILED

```
┌──────────────────────────────────┐
│ my-api              claude       │
│ ⚠ Failed                         │
│ No link found after 30s          │
│ [↺ Restart]        [✕ Delete]    │
└──────────────────────────────────┘
```

### STOPPED

```
┌──────────────────────────────────┐
│ my-api              claude       │
│ ○ Stopped                        │
│ [↺ Restart]        [✕ Delete]    │
└──────────────────────────────────┘
```

---

## Add Project Modal

```
┌──────────────────────────────────────┐
│ Add Project                    [×]   │
├──────────────────────────────────────┤
│ Name *                               │
│ ┌──────────────────────────────────┐ │
│ │ My API Service                   │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Absolute Path *                      │
│ ┌──────────────────────────────────┐ │
│ │ /home/user/projects/my-api       │ │
│ └──────────────────────────────────┘ │
│ ✓ Path exists                        │
│                                      │
│ Environment Variables  (optional)    │
│ One KEY=VALUE per line               │
│ ┌──────────────────────────────────┐ │
│ │ NODE_ENV=development             │ │
│ │ DATABASE_URL=postgres://...      │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [Cancel]             [Save Project]  │
└──────────────────────────────────────┘
```

---

## Agent Selector Modal (Launch flow)

```
┌──────────────────────────────────────┐
│ Launch Agent                   [×]   │
│ Project: my-api                      │
├──────────────────────────────────────┤
│ ● Claude Code                        │
│   claude --remote-control            │
│                                      │
│ ○ Gemini CLI                         │
│   gemini --remote                    │
│                                      │
│ ○ OpenCode                           │
│   opencode serve                     │
│                                      │
│ ○ Codex                              │
│   codex                              │
├──────────────────────────────────────┤
│ [Cancel]               [▶ Launch]    │
└──────────────────────────────────────┘
```

---

## Logs Drawer (slide in from right)

```
┌──────────────────────────────────────────────────────┐
│ Logs — my-api / claude                         [×]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [14:23:01] Starting Claude Code remote session...   │
│  [14:23:02] Initializing workspace: /home/user/…     │
│  [14:23:04] Remote session ready.                    │
│  [14:23:04] https://claude.ai/code/sessions/abc123   │ ← link highlighted
│  [14:23:05] Waiting for connections...               │
│                                                      │
│                                                      │
│                                      [Clear] [Copy]  │
└──────────────────────────────────────────────────────┘
```

---

## Settings Page

```
┌──────────────────────────────────────────────────────┐
│  ⚙ Settings                                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Network                                             │
│  Port          [ 4096        ]                       │
│  Host          [ 0.0.0.0     ]                       │
│                                                      │
│  Security                                            │
│  Password      [ ••••••••    ]  [Change]             │
│  Session TTL   [ 86400       ]  seconds              │
│                                                      │
│  Session Behavior                                    │
│  Link Timeout  [ 30          ]  seconds              │
│  Max Sessions  [ 10          ]                       │
│  Log Lines     [ 500         ]  per session          │
│                                                      │
│  Global Env Vars                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ NODE_ENV=production                          │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Log Level     [info ▼]                              │
│                                                      │
│                          [Reset Defaults]  [Save]    │
└──────────────────────────────────────────────────────┘
```

---

## State Management (Zustand)

```ts
// stores/sessions.ts
interface SessionsStore {
  sessions: Session[]
  addSession: (s: Session) => void
  updateSession: (id: string, patch: Partial<Session>) => void
  appendLog: (id: string, line: string) => void
  removeSession: (id: string) => void
}

// stores/projects.ts
interface ProjectsStore {
  projects: Project[]
  // CRUD actions + fetch
}

// stores/ui.ts
interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  // setters
}

// stores/config.ts
interface ConfigStore {
  config: AppConfig | null
  // fetch + update
}
```

---

## Real-time Update Flow

```
1. User clicks Launch
        ↓
2. POST /api/sessions/launch
        ↓
3. Optimistic: add session card (state = launching)
        ↓
4. Server spawns agent process
        ↓
5. Server streams stdout → regex match
        ↓
6. WS event → session.updated { state: "running", remoteLink: "..." }
        ↓
7. Zustand: updateSession → card re-renders → shows [Open Remote Control]
```

---

## Network Warning Banner

Shown in Header whenever `config.host !== "127.0.0.1"`:

```
⚠  RemoteBridge is exposed on 0.0.0.0 — accessible from the network.
   Make sure your firewall is configured.                        [Dismiss]
```

---

## Responsive Behavior

- **Desktop (≥ 1024px):** sidebar visible, session grid 2–3 columns.
- **Tablet (768–1023px):** sidebar collapses to icon strip, grid 2 columns.
- **Mobile (< 768px):** sidebar hidden (hamburger toggle), grid 1 column.
