# RemoteBridge — Frontend Design Specification

## Design Direction

**Aesthetic: Industrial Command Center**

RemoteBridge is a developer tool that runs locally and orchestrates AI agent processes. The UI should feel like mission-control software — information-dense, authoritative, and precise. Not a startup landing page. Not a SaaS dashboard. A tool that a developer runs in a terminal-adjacent context and trusts completely.

**Core principles:**
- Dark-by-default. Developers keep this open alongside terminals and editors.
- Monospace accents for anything process-related (logs, paths, commands, session IDs).
- Status-first layout — the most important information (session state) is always visible at a glance.
- Every pixel of empty space is intentional. No decorative noise.

**Differentiator:** The one thing users will remember is the session card status system — animated pulse for Running, color-coded border-left accent for each state, and a satisfying "link acquired" transition when the remote URL appears.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 18 + Vite |
| Styling | TailwindCSS v3 + CSS custom properties |
| State | Zustand |
| Animation | CSS transitions + Framer Motion (card mounts/unmounts only) |
| Icons | Lucide React |
| Fonts | Geist (body) + Geist Mono (code/logs/paths) |

---

## Design Tokens

### Color Palette

```css
:root {
  /* Base layers */
  --color-bg-base:       #0b0d12;   /* page background */
  --color-bg-surface:    #111318;   /* sidebar, cards */
  --color-bg-elevated:   #181c26;   /* modal backgrounds */
  --color-bg-overlay:    #1e2230;   /* input fields, code blocks */
  --color-bg-hover:      #242838;   /* hover state fill */

  /* Borders */
  --color-border-subtle:  #1e2230;  /* card borders, dividers */
  --color-border-default: #2a3045;  /* input borders */
  --color-border-strong:  #3a4260;  /* focused inputs */

  /* Text */
  --color-text-primary:  #e4e8f4;   /* headings, important labels */
  --color-text-secondary:#8892a8;   /* descriptions, metadata */
  --color-text-muted:    #4e5a72;   /* timestamps, placeholder */
  --color-text-code:     #a8b8d8;   /* monospace elements */

  /* Brand accent */
  --color-accent:        #3b82f6;   /* primary buttons, focus rings */
  --color-accent-dim:    #1d3461;   /* accent backgrounds */
  --color-accent-glow:   rgba(59, 130, 246, 0.15);

  /* Session state colors */
  --color-running:       #22c55e;   /* green — healthy, active */
  --color-running-dim:   #14532d;
  --color-running-glow:  rgba(34, 197, 94, 0.12);

  --color-launching:     #f59e0b;   /* amber — in-progress */
  --color-launching-dim: #451a03;

  --color-failed:        #ef4444;   /* red — error */
  --color-failed-dim:    #450a0a;

  --color-stopped:       #4e5a72;   /* muted — inactive */
  --color-stopped-dim:   #1a1f2e;

  /* Semantic */
  --color-warning:       #f59e0b;
  --color-warning-bg:    rgba(245, 158, 11, 0.08);
  --color-warning-border:rgba(245, 158, 11, 0.25);
  --color-destructive:   #ef4444;
  --color-success:       #22c55e;
}
```

### Typography

```css
/* Google Fonts import */
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');

:root {
  --font-sans: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace;
}
```

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--text-xs` | 11px | 400 | Timestamps, badges |
| `--text-sm` | 13px | 400/500 | Body copy, labels |
| `--text-base` | 14px | 400 | Default UI text |
| `--text-md` | 15px | 500/600 | Card titles, section headings |
| `--text-lg` | 17px | 600 | Page titles |
| `--text-xl` | 20px | 700 | App name / logo |
| `--text-mono-sm` | 12px | 400 | Log lines, paths |
| `--text-mono-md` | 13px | 500 | Session IDs, commands |

### Spacing Scale

```
2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64
```

### Radius

```
--radius-sm: 4px    (badges, small elements)
--radius-md: 6px    (inputs, buttons)
--radius-lg: 8px    (cards, modals)
--radius-xl: 12px   (modal container)
```

### Elevation (box-shadow)

```css
--shadow-card:   0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px var(--color-border-subtle);
--shadow-modal:  0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px var(--color-border-default);
--shadow-glow-green: 0 0 12px rgba(34, 197, 94, 0.2);
--shadow-glow-red:   0 0 12px rgba(239, 68, 68, 0.2);
```

### Motion

```css
--duration-fast:   120ms
--duration-normal: 200ms
--duration-slow:   350ms
--ease-standard:   cubic-bezier(0.4, 0, 0.2, 1)
--ease-decelerate: cubic-bezier(0, 0, 0.2, 1)
--ease-accelerate: cubic-bezier(0.4, 0, 1, 1)
```

---

## Page Map

```
/login      LoginPage          (public)
/           Dashboard          (auth required)
/settings   SettingsPage       (auth required)
```

---

## Component Tree

```
App
├── LoginPage
└── AuthGuard
    └── Layout
        ├── NetworkWarningBanner  (conditional — host=0.0.0.0)
        ├── Header
        │   ├── AppLogo          ("RB" monogram + "RemoteBridge" wordmark)
        │   ├── ConnectionBadge  (animated dot + label)
        │   └── HeaderActions
        │       ├── SettingsLink
        │       └── LogoutButton
        ├── Sidebar
        │   ├── SectionLabel     "PROJECTS"
        │   ├── ProjectList
        │   │   └── ProjectItem (× N)
        │   │       ├── ProjectName
        │   │       ├── ProjectPath (truncated, monospace)
        │   │       ├── LaunchButton
        │   │       └── ProjectMenuButton (⋯)
        │   └── AddProjectButton
        └── MainPanel
            ├── PanelHeader      "ACTIVE SESSIONS"  +  SessionCount badge
            ├── SessionGrid
            │   └── SessionCard (× N)
            └── EmptyState

── Portals ──────────────────────────────────
AddProjectModal
EditProjectModal
AgentSelectorModal
DeleteConfirmModal
LogsDrawer         (slide-in from right)
SettingsPage       (full-page route, not portal)
```

---

## Layout — Dashboard

### Desktop (≥ 1024px)

```
┌────────────────────────────────────────────────────────────────────────┐
│  ■ RemoteBridge  ·  ● Connected                       [⚙] [Logout]    │  ← Header (48px)
├──────────────────────┬─────────────────────────────────────────────────┤
│ PROJECTS         [+] │ ACTIVE SESSIONS                          3 ——   │  ← Panel headers (36px)
│                      │                                                  │
│  my-api              │  ┌─────────────────────┐ ┌──────────────────┐   │
│  ~/projects/my-api   │  │ my-api   claude      │ │ frontend  gemini │   │
│  [▶ Launch]      [⋯] │  │ ● Running            │ │ ◌ Launching…     │   │
│                      │  │                      │ │ ▒▒▒▒▒░░░░░░░░░░  │   │
│  frontend-app        │  │  [Open Remote ↗]     │ │ waiting for link │   │
│  ~/projects/front    │  │  [■ Stop]  [≡ Logs]  │ └──────────────────┘   │
│  [▶ Launch]      [⋯] │  └─────────────────────┘                        │
│                      │                                                  │
│  data-pipeline       │  ┌─────────────────────┐                        │
│  ~/projects/data     │  │ data-pipeline        │                        │
│  [▶ Launch]      [⋯] │  │ opencode             │                        │
│                      │  │ ⚠ Failed             │                        │
│                      │  │ No link found (30s)  │                        │
│                      │  │ [↺ Restart] [✕ Del]  │                        │
│                      │  └─────────────────────┘                        │
│                      │                                                  │
└──────────────────────┴─────────────────────────────────────────────────┘
  240px fixed               auto (flex)
```

### Tablet (768–1023px)

```
┌────────────────────────────────────────────────────────────────────┐
│  ■ RB  ● Connected                                  [⚙] [Logout]  │
├───────┬────────────────────────────────────────────────────────────┤
│       │ ACTIVE SESSIONS                                      3     │
│  ▶    │                                                            │
│  ⊡    │  ┌──────────────────────┐  ┌──────────────────────┐       │
│  ⊞    │  │ my-api / claude      │  │ frontend / gemini    │       │
│       │  │ ● Running            │  │ ◌ Launching…         │       │
│  [+]  │  │ [Open Remote ↗]      │  │ ░░░░░░░░░░░          │       │
│       │  │ [■ Stop] [≡ Logs]    │  └──────────────────────┘       │
│       │  └──────────────────────┘                                  │
└───────┴────────────────────────────────────────────────────────────┘
  48px     auto
  icon-only sidebar — hover expands to 200px with tooltip labels
```

### Mobile (< 768px)

```
┌──────────────────────────────────┐
│  ■ RemoteBridge         [☰] [⚙] │
├──────────────────────────────────┤
│  ACTIVE SESSIONS              2  │
│                                  │
│  ┌──────────────────────────┐    │
│  │ my-api                   │    │
│  │ claude  ● Running        │    │
│  │ [Open Remote ↗]          │    │
│  │ [■ Stop]   [≡ Logs]      │    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │ frontend-app             │    │
│  │ gemini  ◌ Launching…     │    │
│  │ ▒▒▒▒▒░░░░░░░░            │    │
│  └──────────────────────────┘    │
│                                  │
│      ─ No more sessions ─        │
└──────────────────────────────────┘
  Full-width. Sidebar = offscreen drawer (hamburger toggle).
  Session grid = 1 column.
```

---

## Components

### Header

```
┌────────────────────────────────────────────────────────────────────┐
│  ■ RemoteBridge        ● Connected                   [⚙]  [Logout] │
└────────────────────────────────────────────────────────────────────┘
  ↑                       ↑                             ↑      ↑
  AppLogo                ConnectionBadge             Settings  Logout
  (logo monogram          (animated green dot;        icon      button
   + wordmark)            pulsing when WS connecting)
```

**AppLogo:**
- Square `24×24` monogram: "RB" in `--font-mono`, `--color-accent`, bg `--color-accent-dim`, `border-radius: 4px`
- Wordmark: "RemoteBridge" in `--text-md`, `--font-sans`, weight 600, `--color-text-primary`
- Separator: `1px` vertical `--color-border-subtle` between logo and rest of header

**ConnectionBadge states:**

| State | Dot | Label | Animation |
|-------|-----|-------|-----------|
| Connected | `--color-running` filled | "Connected" | Slow 3s pulse (opacity 1→0.5→1) |
| Connecting | `--color-launching` filled | "Connecting…" | Fast 1s blink |
| Disconnected | `--color-stopped` filled | "Disconnected" | None |

**Header height:** `48px`. Background: `--color-bg-surface`. Bottom border: `1px solid --color-border-subtle`.

---

### Network Warning Banner

Shown **above** the header whenever `config.host !== "127.0.0.1"`.

```
┌────────────────────────────────────────────────────────────────────┐
│  ⚠  RemoteBridge is exposed on 0.0.0.0 — accessible from the       │
│     network. Ensure your firewall is configured.       [Dismiss ×] │
└────────────────────────────────────────────────────────────────────┘
```

- Background: `--color-warning-bg`, border-bottom: `1px solid --color-warning-border`
- Icon: `⚠` in `--color-warning`, `16px`
- Text: `--text-sm`, `--color-text-primary` for emphasis phrase, `--color-text-secondary` for rest
- Dismiss: stores preference in `localStorage` per-session (reappears on next reload)
- Height: `40px` fixed. Does NOT push header — sits above it as a sticky top banner.

---

### Sidebar

**Width:** `240px` (desktop), `48px` icon-strip (tablet), offscreen drawer (mobile).

```
┌──────────────────────┐
│ PROJECTS         [+] │  ← section label + add button
├──────────────────────┤
│                      │
│  my-api          ⋯   │  ← ProjectItem (default)
│  ~/projects/my-api   │
│  [▶ Launch]          │
│                      │
│  frontend-app    ⋯   │  ← ProjectItem (hover — shows menu button)
│  ~/projects/front    │
│  [▶ Launch]          │
│                      │
│  data-pipeline   ⋯   │
│  ~/projects/data     │
│  [▶ Launch]          │
│                      │
└──────────────────────┘
```

**Section label "PROJECTS":**
- `--text-xs`, weight 600, letter-spacing 0.08em
- `--color-text-muted`, ALL CAPS
- Padding: `16px 16px 8px`

**ProjectItem (240px wide card):**

```
┌──────────────────────────┐
│ my-api               ⋯  │  ← name (--text-sm, 500) + menu button (hidden until hover)
│ ~/projects/my-api        │  ← path (--text-mono-sm, truncated, --color-text-muted)
│ [▶ Launch]               │  ← ghost button
└──────────────────────────┘
```

States:
- **Default:** no background, border `1px solid transparent`
- **Hover:** `--color-bg-hover`, border `1px solid --color-border-subtle`
- **Active project** (has a running session): left border `2px solid --color-running`
- Border-radius: `--radius-md`
- Padding: `10px 12px`
- Margin-bottom: `4px`

**ProjectItem path:**
- `font-family: --font-mono`, `--text-mono-sm`
- Truncate with `text-overflow: ellipsis`, always single line
- Show full path on hover via tooltip (`title` attribute)

**Launch Button:**
- Ghost style: `background: transparent`, border `1px solid --color-border-default`
- `--text-xs`, weight 500
- Hover: `--color-bg-overlay`, border `--color-border-strong`
- Active: scale 0.97 transition
- Icon: `▶` or `Play` (Lucide) `12px`, color `--color-accent`

**Project context menu (⋯):**
```
┌─────────────────┐
│  ✎ Edit         │
│  ✕ Delete       │
└─────────────────┘
```
- Dropdown anchored to the `⋯` button
- Delete triggers `DeleteConfirmModal`
- Close on outside click or Escape

**Add Project Button `[+]`:**
- In section header, right-aligned
- Icon button: `+` in `--color-accent`, `--radius-sm`
- Tooltip: "Add project"

---

### SessionCard

The most complex component. **Fixed width in grid**, height varies by state.

**Card base:**
- Background: `--color-bg-surface`
- Border: `1px solid --color-border-subtle`
- Border-left: `3px solid <state-color>` (the most visible state signal)
- Border-radius: `--radius-lg`
- Padding: `16px`
- Box-shadow: `--shadow-card`
- Framer Motion: `layout` prop for smooth height transitions between states

**Card header (always visible):**

```
┌──────────────────────────────────────┐
│ my-api                 claude        │  ← project name (left) + agent badge (right)
└──────────────────────────────────────┘
  --text-md, 600              --text-xs badge
  --color-text-primary        monospace, --color-text-code
                              bg --color-bg-overlay, radius --radius-sm
                              padding 2px 6px
```

---

#### State: LAUNCHING

Border-left: `3px solid --color-launching`

```
┌──────────────────────────────────────┐
│ my-api                        claude │
│                                      │
│ ◌  Launching…                        │  ← amber dot (spinning) + label
│                                      │
│ ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← progress bar (indeterminate)
│ waiting for remote link              │  ← hint text (--text-xs, --color-text-muted)
│                                      │
│ [≡ Logs]                             │  ← logs button only
└──────────────────────────────────────┘
```

- Spinning dot: CSS `@keyframes spin` on a ring SVG, `--color-launching`
- Progress bar: `width: 100%`, animated shimmer left→right, `--color-launching` on `--color-bg-overlay`
- "waiting for remote link" fades in after `1s` delay

---

#### State: RUNNING

Border-left: `3px solid --color-running`  
Entry animation: card border-left transitions from `--color-launching` to `--color-running` (0.4s ease).

```
┌──────────────────────────────────────┐
│ my-api                        claude │
│                                      │
│ ●  Running                           │  ← green pulsing dot + label
│                                      │
│ ┌──────────────────────────────────┐ │
│ │  Open Remote Control  ↗          │ │  ← primary CTA
│ └──────────────────────────────────┘ │
│                                      │
│ [■ Stop]                  [≡ Logs]   │
└──────────────────────────────────────┘
```

- Green pulsing dot: `@keyframes pulse` on `box-shadow: 0 0 0 4px --color-running-glow`
- **Open Remote Control** button:
  - Full-width inside card
  - Background: `--color-accent-dim`, border `1px solid --color-accent` (dim)
  - Hover: background `--color-accent`, text white, subtle glow
  - Icon: `↗` (ExternalLink from Lucide), `14px`
  - Font: `--text-sm`, weight 600
- **Stop** button: ghost, icon `■`, hover border/text `--color-failed`
- **Logs** button: ghost, icon `≡` (AlignLeft from Lucide), hover border/text `--color-text-primary`

---

#### State: FAILED

Border-left: `3px solid --color-failed`  
Card has a subtle `--color-failed` glow: `box-shadow: --shadow-card, 0 0 0 1px rgba(239,68,68,0.1)`

```
┌──────────────────────────────────────┐
│ my-api                        claude │
│                                      │
│ ⚠  Failed                            │  ← red icon + label
│ No link found after 30s              │  ← reason (--text-sm, --color-text-secondary)
│                                      │
│ [↺ Restart]               [✕ Delete] │
└──────────────────────────────────────┘
```

- Restart: ghost button, icon `↺`, hover accent
- Delete: ghost button, icon `✕`, hover `--color-failed`

---

#### State: STOPPED

Border-left: `3px solid --color-stopped`

```
┌──────────────────────────────────────┐
│ my-api                        claude │
│                                      │
│ ○  Stopped                           │  ← gray hollow dot + label
│                                      │
│ [↺ Restart]               [✕ Delete] │
└──────────────────────────────────────┘
```

---

#### Session Grid Layout

```css
.session-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  padding: 16px;
}

/* Desktop: 2–3 columns naturally */
/* Tablet: 2 columns */
/* Mobile: 1 column */
```

---

#### Empty State (no sessions)

```
┌──────────────────────────────────────────────┐
│                                              │
│              ⬡                               │
│        No active sessions                    │
│    Select a project and click Launch         │
│        to start an AI agent.                 │
│                                              │
└──────────────────────────────────────────────┘
```

- Icon: hexagonal "empty" shape, `48px`, `--color-text-muted`
- Title: `--text-md`, `--color-text-secondary`
- Subtitle: `--text-sm`, `--color-text-muted`
- Centered in main panel, vertically centered using `flex`

---

### Add Project Modal

**Width:** `480px` (desktop), `100vw - 32px` (mobile). Max-height: `90vh`.

```
┌──────────────────────────────────────────────┐
│ Add Project                              [×] │  ← modal header
├──────────────────────────────────────────────┤
│                                              │
│  Name *                                      │
│  ┌────────────────────────────────────────┐  │
│  │ My API Service                         │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Absolute Path *                             │
│  ┌────────────────────────────────────────┐  │
│  │ /home/user/projects/my-api             │  │  ← monospace font
│  └────────────────────────────────────────┘  │
│  ✓ Path exists              ← validation     │
│                                              │
│  Environment Variables  (optional)           │
│  One KEY=VALUE per line                      │
│  ┌────────────────────────────────────────┐  │
│  │ NODE_ENV=development                   │  │  ← monospace textarea
│  │ DATABASE_URL=postgres://…              │  │
│  └────────────────────────────────────────┘  │
│                                              │
├──────────────────────────────────────────────┤
│  [Cancel]                   [Save Project]   │  ← modal footer
└──────────────────────────────────────────────┘
```

**Input fields:**
- Background: `--color-bg-overlay`
- Border: `1px solid --color-border-default`
- Focus border: `1px solid --color-accent`, `box-shadow: 0 0 0 3px --color-accent-glow`
- Border-radius: `--radius-md`
- Padding: `10px 12px`
- Font-size: `--text-base`

**Path field:**
- `font-family: --font-mono`
- `--text-mono-sm`

**Path validation indicator:**

| State | Icon | Color | Text |
|-------|------|-------|------|
| Idle | — | — | — |
| Checking | `◌` spinning | `--color-launching` | "Checking…" |
| Valid | `✓` | `--color-running` | "Path exists" |
| Invalid | `✕` | `--color-failed` | "Path not found or not a directory" |

Path validation: debounced 400ms after last keystroke. `GET /api/projects/validate-path?path=...` (or inline server validation on save).

**Env textarea:**
- `font-family: --font-mono`, `--text-mono-sm`
- `min-height: 80px`, resizable vertically only
- Subtle line-by-line syntax: `KEY` in `--color-accent`, `=` in `--color-text-muted`, `VALUE` in `--color-text-code` (handled via CodeMirror lite or CSS hack)

**Modal backdrop:** `rgba(0, 0, 0, 0.7)`, `backdrop-filter: blur(2px)`
**Modal entry animation:** scale from 0.96 + opacity 0 → 1 over 200ms

---

### Edit Project Modal

Identical layout to Add Project Modal, but:
- Title: "Edit Project"
- Fields pre-populated
- Footer: `[Cancel]` + `[Save Changes]`

---

### Agent Selector Modal (Launch flow)

**Width:** `400px`

```
┌──────────────────────────────────────────┐
│ Launch Agent                        [×]  │
│ Project: my-api                          │  ← subtitle (--text-sm, --color-text-secondary)
├──────────────────────────────────────────┤
│                                          │
│ ● Claude Code                 [active]   │  ← selected
│   claude --remote-control                │  ← command preview (monospace)
│                                          │
│ ○ Gemini CLI            [coming soon]    │  ← disabled (Phase 1)
│   gemini --remote                        │
│                                          │
│ ○ OpenCode              [coming soon]    │  ← disabled (Phase 1)
│   opencode serve                         │
│                                          │
│ ○ Codex                 [coming soon]    │  ← disabled (Phase 1)
│   codex                                  │
│                                          │
├──────────────────────────────────────────┤
│  [Cancel]                   [▶ Launch]   │
└──────────────────────────────────────────┘
```

**Agent option row:**
- Border: `1px solid --color-border-subtle`, radius `--radius-md`, padding `12px 14px`
- Selected: border `1px solid --color-accent`, bg `--color-accent-dim`
- Disabled: opacity `0.45`, `cursor: not-allowed`, radio input `disabled`
- Agent name: `--text-sm`, weight 500
- Command: `--text-mono-sm`, `--color-text-muted`, font-mono
- Badge `[coming soon]`: `--text-xs`, bg `--color-bg-overlay`, color `--color-text-muted`, border-radius `--radius-sm`, padding `2px 6px`
- Spacing between rows: `8px`

**Remember last agent:** Pre-select `project.lastAgentId` if set.

**Launch button:**
- Primary style: bg `--color-accent`, white text
- Disabled when no agent selected (shouldn't happen — default is Claude Code)
- Loading state after click: spinner replaces `▶` icon, button text "Launching…"

---

### Delete Confirm Modal

**Width:** `360px`. Minimal, intentionally small — this is a destructive action.

```
┌────────────────────────────────────────┐
│ Delete Project                    [×]  │
├────────────────────────────────────────┤
│                                        │
│  Delete "my-api"?                      │
│                                        │
│  This will remove the project and      │
│  all associated session records.       │
│  Running sessions will be stopped.     │
│                                        │
├────────────────────────────────────────┤
│  [Cancel]              [Delete]        │
│                         ↑ --color-destructive border+text (ghost)
│                         hover: bg --color-failed, white text
└────────────────────────────────────────┘
```

---

### Logs Drawer

Slide in from **right**. Width: `560px` (desktop), `100vw` (mobile).

```
┌────────────────────────────────────────────────────────┐
│  ≡ Logs — my-api / claude                         [×]  │  ← drawer header (sticky)
├────────────────────────────────────────────────────────┤
│                                                        │
│  [14:23:01.432]  Starting Claude Code remote…         │
│  [14:23:02.104]  Initializing workspace:              │
│                  /home/user/projects/my-api           │  ← wrapped path
│  [14:23:04.891]  Remote session ready.                │
│  [14:23:04.892]  https://claude.ai/code/session_…    │  ← highlighted URL (--color-accent, underline)
│  [14:23:05.011]  Waiting for connections…             │
│                                                        │
│  ──────────────  end of logs  ──────────────          │  ← when session stopped
│                                                        │
└────────────────────────────────────────────────────────┘
│  [Clear]                                    [Copy All] │  ← drawer footer (sticky)
└────────────────────────────────────────────────────────┘
```

**Log area:**
- Background: `--color-bg-base` (darkest layer — like a terminal)
- Font: `--font-mono`, `--text-mono-sm`, `--color-text-code`, line-height `1.6`
- Padding: `16px`
- `overflow-y: auto`, auto-scrolls to bottom on new lines
- Pause auto-scroll when user has manually scrolled up (show "↓ Jump to bottom" button)

**Timestamp:**
- `[HH:MM:SS.mmm]` format
- Color: `--color-text-muted`

**URL lines:**
- Detected by the same `linkPattern` regex (frontend mirrors backend)
- Rendered as a clickable link: `--color-accent`, underline on hover, opens in new tab
- Soft background highlight: `--color-accent-dim` on that line

**No logs state:**
```
  (no output yet — session starting)
```
Italic, `--color-text-muted`

**Drawer overlay:** same backdrop as modals. Drawer animation: slide from `translateX(100%)` → `translateX(0)` over 250ms ease-decelerate.

**Footer actions:**
- **Clear:** removes in-memory logs (local only, session logs on server remain). Confirm with inline tooltip: "Cleared."
- **Copy All:** copies full log to clipboard. Feedback: button label changes to "Copied ✓" for 1.5s.

---

### Login Page

**Full-screen, centered card on dark background.**

```
┌──────────────────────────────────────┐
│                                      │
│     ■ RemoteBridge                   │  ← logo, centered
│                                      │
│  ┌────────────────────────────────┐  │
│  │            Login               │  │  ← card
│  ├────────────────────────────────┤  │
│  │                                │  │
│  │  Password                      │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ ••••••••••••             │  │  │
│  │  └──────────────────────────┘  │  │
│  │                                │  │
│  │  [Login]                       │  │  ← full-width primary button
│  │                                │  │
│  │  Wrong password. Try again.    │  │  ← error state (--color-failed)
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

- Background: `--color-bg-base` with subtle radial gradient center: `rgba(59,130,246,0.04)`
- Card: `--color-bg-surface`, `--shadow-modal`, width `340px`, padding `32px`
- Logo: centered, same as header logo but larger (`32×32` monogram, `--text-xl` wordmark)
- Password field: same style as modals + `type="password"`, show/hide toggle (Eye icon)
- Login button: full-width primary
- Error: appears below button with icon `⚠`, `--color-failed`, `--text-sm`
- Rate limit message: "Too many attempts. Try again in 60 seconds." with countdown

---

### Settings Page

**Full-page route at `/settings`.** Not a modal. Has back-navigation to `/`.

```
┌────────────────────────────────────────────────────────┐
│  ← Dashboard              ⚙ Settings                  │  ← header (same as layout header)
├────────────────────────────────────────────────────────┤
│                                                        │
│  Settings                                              │  ← page title
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Network                                         │  │  ← section card
│  ├──────────────────────────────────────────────────┤  │
│  │  Port                      [ 4096         ]      │  │
│  │  Host                      [ 0.0.0.0      ]      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Security                                        │  │
│  ├──────────────────────────────────────────────────┤  │
│  │  Password       [ ••••••••         ] [Change]    │  │
│  │  Session TTL    [ 86400            ]  seconds    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Session Behavior                                │  │
│  ├──────────────────────────────────────────────────┤  │
│  │  Link Timeout   [ 30               ]  seconds    │  │
│  │  Max Sessions   [ 10               ]             │  │
│  │  Log Lines      [ 500              ]  per session│  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Global Env Vars                                 │  │
│  ├──────────────────────────────────────────────────┤  │
│  │  ┌──────────────────────────────────────────┐   │  │
│  │  │ NODE_ENV=production                      │   │  │  ← monospace textarea
│  │  └──────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Logging                                         │  │
│  ├──────────────────────────────────────────────────┤  │
│  │  Log Level      [info ▼]                         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│                    [Reset Defaults]   [Save Settings]  │  ← sticky footer (on scroll)
└────────────────────────────────────────────────────────┘
```

**Section cards:**
- Background: `--color-bg-surface`
- Border: `1px solid --color-border-subtle`
- Border-radius: `--radius-lg`
- Section header: `--text-sm`, weight 600, `--color-text-secondary`, padding `14px 16px`, border-bottom `1px solid --color-border-subtle`
- Content padding: `16px`

**Form rows:**
- `display: flex; justify-content: space-between; align-items: center`
- Label: `--text-sm`, `--color-text-primary`
- Input: `width: 200px` (right-aligned)
- Unit label (seconds, etc.): `--text-sm`, `--color-text-muted`, margin-left `8px`

**Settings page max-width:** `640px`, centered.

**Change Password:**
- Inline flow — clicking `[Change]` expands a small form below: "Current password", "New password", "Confirm", `[Save]` / `[Cancel]`

**Save footer:**
- Sticky bottom when page scrolls
- Background: `--color-bg-surface`, top border: `1px solid --color-border-subtle`
- `[Reset Defaults]`: ghost button, opens confirm dialog
- `[Save Settings]`: primary button. After save: button shows "Saved ✓" for 2s, then reverts

**Unsaved changes indicator:**
- Dot in page title or tab: "⚙ Settings ●" when form is dirty (has unsaved changes)
- Navigating away with unsaved changes shows browser confirm dialog

---

## State Management (Zustand)

```ts
// stores/sessions.ts
interface Session {
  id: string
  projectId: string
  agentId: string
  state: 'launching' | 'running' | 'stopped' | 'failed'
  remoteLink: string | null
  failureReason: string | null  // e.g. "No link found after 30s"
  startedAt: string             // ISO timestamp
  stoppedAt: string | null
  logs: string[]                // last N lines
}

interface SessionsStore {
  sessions: Session[]
  addSession:     (s: Session) => void
  updateSession:  (id: string, patch: Partial<Session>) => void
  appendLog:      (id: string, line: string) => void
  removeSession:  (id: string) => void
}

// stores/projects.ts
interface Project {
  id: string
  name: string
  path: string
  env: Record<string, string>
  lastAgentId: string | null
}

interface ProjectsStore {
  projects: Project[]
  isLoading: boolean
  fetchProjects:  () => Promise<void>
  addProject:     (p: Omit<Project, 'id'>) => Promise<void>
  updateProject:  (id: string, patch: Partial<Project>) => Promise<void>
  deleteProject:  (id: string) => Promise<void>
}

// stores/ui.ts
interface UIStore {
  addProjectOpen:         boolean
  editProjectId:          string | null
  agentSelectorProjectId: string | null
  logsSessionId:          string | null
  deleteConfirmProjectId: string | null

  openAddProject:         () => void
  openEditProject:        (id: string) => void
  openAgentSelector:      (projectId: string) => void
  openLogs:               (sessionId: string) => void
  openDeleteConfirm:      (projectId: string) => void
  closeAll:               () => void
}

// stores/config.ts
interface ConfigStore {
  config: AppConfig | null
  isLoading: boolean
  isDirty: boolean
  fetchConfig:   () => Promise<void>
  updateConfig:  (patch: Partial<AppConfig>) => void  // local only (marks dirty)
  saveConfig:    () => Promise<void>
  resetDefaults: () => Promise<void>
}

// stores/ws.ts
interface WsStore {
  status: 'connected' | 'connecting' | 'disconnected'
  connect:    () => void
  disconnect: () => void
}
```

---

## Real-time Update Flow

```
1. User clicks [▶ Launch] on ProjectItem
       ↓
2. UIStore: openAgentSelector(projectId)
       ↓
3. AgentSelectorModal opens
       ↓
4. User selects agent (default: claude) and clicks [▶ Launch]
       ↓
5. POST /api/sessions/launch { projectId, agentId }
       ↓
6. Optimistic: SessionsStore.addSession({ state: 'launching', ... })
   Session card appears immediately in grid with LAUNCHING state
       ↓
7. Server spawns agent process
       ↓
8. Server streams stdout line by line via WS: { type: "session.log", ... }
   → SessionsStore.appendLog(id, line)   → card logs update in real-time
       ↓
9. Link matched on server
   WS: { type: "session.updated", payload: { state: "running", remoteLink: "..." } }
   → SessionsStore.updateSession(id, { state: 'running', remoteLink })
   → Card animates to RUNNING state (border-left color transition)
       ↓
10. User clicks [Open Remote Control] → window.open(remoteLink, '_blank')
       ↓
11. User clicks [■ Stop]
    POST /api/sessions/:id/stop
    WS: session.updated { state: "stopped" }
    → Card transitions to STOPPED state
```

---

## Keyboard Navigation & Accessibility

### Focus Management

- **Modal open:** Focus moves to modal container (first focusable element)
- **Modal close:** Focus returns to triggering element
- **Trap focus inside modals** using a focus trap utility
- All interactive elements must have visible `:focus-visible` outline: `2px solid --color-accent`, offset `2px`

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Close modal / drawer |
| `Enter` on session card | Open Remote Control (if running) |
| `←` / `→` | Navigate agent options in AgentSelectorModal |

### Accessibility

- All icon-only buttons have `aria-label`
- Status badges have `role="status"` and `aria-live="polite"` for state changes
- Session card state changes announce via `aria-live="assertive"` (RUNNING state = "Session started. Remote link available.")
- Color is never the **only** signal — each state has a distinct icon AND label in addition to color
- Minimum contrast ratio 4.5:1 for all text
- Logs drawer uses `role="log"` with `aria-live="polite"` and `aria-atomic="false"`

---

## Animation Inventory

| Element | Trigger | Animation | Duration |
|---------|---------|-----------|----------|
| Session card mount | New session | Fade in + slide up 8px | 200ms ease-decelerate |
| Session card unmount | Delete | Fade out + scale 0.96 | 150ms ease-accelerate |
| Card border-left | State change | Color transition | 400ms ease |
| Progress bar (launching) | Continuous | Shimmer sweep | 1.5s infinite |
| Status dot (running) | Continuous | Pulse glow | 3s ease-in-out infinite |
| Status dot (connecting) | Continuous | Opacity blink | 1s step-start infinite |
| Spinning indicator | Launching | Rotate 360° | 1s linear infinite |
| Modal open | User action | Scale 0.96→1 + fade | 200ms ease-decelerate |
| Logs drawer open | User action | Slide in from right | 250ms ease-decelerate |
| Logs drawer close | User action | Slide out to right | 200ms ease-accelerate |
| Link acquire (running→) | State change | Border glow pulse ×3 | 600ms, then steady |
| Button press | Click | Scale 0.97 | 120ms |

**Reduce Motion:** All animations respect `@media (prefers-reduced-motion: reduce)`. Use instant transitions or none at all.

---

## Responsive Behavior

| Breakpoint | Sidebar | Session Grid | Header |
|------------|---------|-------------|--------|
| Desktop (≥ 1024px) | 240px fixed | `auto-fill minmax(280px, 1fr)` = 2–3 col | Full |
| Tablet (768–1023px) | 48px icon-strip | 2 columns fixed | Abbreviated wordmark |
| Mobile (< 768px) | Off-screen drawer | 1 column | Mobile header with hamburger |

**Sidebar drawer (mobile):**
- Toggle via hamburger `☰` in header
- Slides in from left over page content (not a layout shift)
- Full height, same width as desktop (240px) but overlays content
- Backdrop overlay to close

**Tablet icon-strip sidebar:**
- Shows icon version of project markers (colored dots for active sessions) + `+` button
- Hover over any icon: tooltip shows project name + path
- No expand-on-hover on touch devices

---

## Error States

### API Error Toast

Global error toast system. Position: bottom-right corner.

```
┌──────────────────────────────────────┐
│ ⚠  Failed to launch session          │
│    Connection refused on port 4096   │  ← error detail (--text-xs, muted)
│                                 [×]  │
└──────────────────────────────────────┘
```

- Background: `--color-bg-elevated`, border-left `3px solid --color-failed`
- Auto-dismiss after 6s unless user hovers
- Max 3 simultaneous toasts, stacked with 8px gap
- Entry: slide up from bottom + fade; exit: fade

### Connection Lost Banner

When WebSocket disconnects:

```
┌────────────────────────────────────────────────────────────────┐
│  ◌  Connection lost. Reconnecting…                             │
└────────────────────────────────────────────────────────────────┘
```

- Appears at top of main panel (below header)
- Background `--color-launching-dim`, border-bottom `1px solid --color-launching`
- Disappears automatically when WS reconnects; replaces with brief "● Reconnected" flash

### 404 / Unexpected Route

```
┌──────────────────────────────────┐
│                                  │
│     ¿ Page not found             │
│     ← Back to Dashboard          │
│                                  │
└──────────────────────────────────┘
```

---

## CSS Architecture Notes

- Use **CSS custom properties** (design tokens) at `:root` — not Tailwind `@apply` for colors.
- Tailwind for layout and spacing utilities only (`flex`, `gap-*`, `p-*`, `grid-*`).
- Component-level styles in CSS modules or styled-components when Tailwind utility classes become unwieldy (SessionCard states, LogsDrawer line highlighting).
- Never use Tailwind `text-blue-500` directly — always reference `--color-accent` for theming consistency.
- Single global `theme.css` file exports all tokens. All components import from there.

---

## File Structure (Frontend)

```
src/web/
├── index.html
├── main.tsx
├── App.tsx
├── theme.css                     ← design tokens (:root)
│
├── pages/
│   ├── LoginPage.tsx
│   ├── Dashboard.tsx
│   └── SettingsPage.tsx
│
├── components/
│   ├── layout/
│   │   ├── Layout.tsx
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── NetworkWarningBanner.tsx
│   │
│   ├── sessions/
│   │   ├── SessionGrid.tsx
│   │   ├── SessionCard.tsx       ← handles all 4 states
│   │   └── EmptyState.tsx
│   │
│   ├── projects/
│   │   ├── ProjectItem.tsx
│   │   └── ProjectMenu.tsx       ← popover ⋯ menu
│   │
│   ├── modals/
│   │   ├── AddProjectModal.tsx
│   │   ├── EditProjectModal.tsx
│   │   ├── AgentSelectorModal.tsx
│   │   └── DeleteConfirmModal.tsx
│   │
│   ├── drawers/
│   │   └── LogsDrawer.tsx
│   │
│   └── ui/                       ← reusable primitives
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Textarea.tsx
│       ├── Badge.tsx
│       ├── StatusDot.tsx
│       ├── Modal.tsx             ← generic portal + backdrop
│       ├── Toast.tsx
│       └── Tooltip.tsx
│
├── stores/
│   ├── sessions.ts
│   ├── projects.ts
│   ├── ui.ts
│   ├── config.ts
│   └── ws.ts
│
└── lib/
    ├── api.ts                    ← typed fetch wrapper (CSRF header injected)
    └── useWebSocket.ts           ← WS hook (reconnect, event dispatch)
```
