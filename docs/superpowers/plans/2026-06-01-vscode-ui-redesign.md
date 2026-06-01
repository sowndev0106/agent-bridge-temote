# VS Code-like UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the RemoteBridge web UI into a VS Code-style shell — Activity Bar (projects) → Primary Sidebar (file EXPLORER + SESSIONS) → dockable editor area with draggable Monaco tabs → bottom terminal.

**Architecture:** Assemble three focused libraries instead of running real VS Code: **dockview** for the multi-tab/dockable editor area, **react-complex-tree** for the file explorer (backed by the existing `api.listProjectFiles` lazy-loading endpoint), and **@monaco-editor/react** for the file viewer/editor. A single `react-resizable-panels` split composes the outer shell (ActivityBar | Sidebar | EditorArea+Terminal). All data flow reuses the current fastify backend — no API changes.

**Tech Stack:** React 18, TypeScript, Vite, Zustand, TailwindCSS (CSS-variable theme tokens), dockview 6, react-complex-tree 2, @monaco-editor/react 4 + monaco-editor 0.55, react-resizable-panels 4. Existing: xterm terminals, react-router-dom 6.

---

## Background & Constraints (read before starting)

- **Theme tokens:** The app styles everything with CSS variables defined in `src/web/index.css` (`--color-bg-base`, `--color-bg-surface`, `--color-bg-hover`, `--color-border-subtle`, `--color-accent`, `--color-text-primary/secondary/muted`, `--radius-md`, etc.). All new components MUST use these tokens, and dockview/RCT default CSS MUST be overridden to match.
- **Existing API client** (`src/web/lib/api.ts`) — reuse, do NOT change:
  - `api.listProjectFiles(projectId, path?)` → `FileListResult { rootPath, path, parent, entries: FileEntry[] }`. Returns **one directory level**; perfect for react-complex-tree lazy children.
  - `api.getProjectFilePreview(projectId, path)` → `FilePreviewResult` (discriminated union on `type`: `'text' | 'binary' | 'directory' | 'too_large' | 'unsupported'`).
  - `api.writeProjectFile(projectId, path, content)` → `{ success }`.
- **Types** live in `src/types.ts` (`FileEntry`, `FileListResult`, `FilePreviewResult`, `Project`, `Session`).
- **Stores:** `useProjectsStore`, `useSessionsStore`, `useUIStore`, `useTerminalsStore`, `useConfigStore`. Reuse `lib/format` helpers (`initials`, `projectColor`, `compareSessions`, `dayLabel`).
- **Terminal panel** (`src/web/components/TerminalPanel.tsx`) and `SessionRow.tsx` stay functionally unchanged; they are composed into the new shell.
- **Project is desktop-first now.** The mobile sidebar overlay (`mobileSidebarOpen`) is dropped. Update `tests/e2e/responsive-ui.spec.ts` accordingly in the final task.
- **Monaco bundle:** Configure Vite so Monaco workers load correctly and Monaco is code-split (dynamic import via `@monaco-editor/react` `loader`).

## File Structure (created / modified / deleted)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/web/stores/editor.ts` | Open editor tabs state; bridges FileTree clicks ↔ dockview panels |
| Create | `src/web/components/ActivityBar.tsx` | Far-left 48px rail: project icons, add-project, settings, help |
| Create | `src/web/components/FileTree.tsx` | react-complex-tree file explorer w/ lazy data provider |
| Create | `src/web/lib/fileTreeProvider.ts` | `TreeDataProvider` impl calling `api.listProjectFiles` |
| Create | `src/web/components/MonacoFilePanel.tsx` | Monaco editor panel: load/save one file |
| Create | `src/web/components/SessionsPanel.tsx` | Sessions grouped-by-day list (reuses `SessionRow`) |
| Create | `src/web/components/EditorArea.tsx` | dockview host; renders file + sessions panels as tabs |
| Create | `src/web/components/PrimarySidebar.tsx` | EXPLORER + SESSIONS collapsible sections |
| Create | `src/web/components/TitleBar.tsx` | 28px top bar: logo, connection dot, exposure warning, logout |
| Create | `src/web/styles/dockview-theme.css` | dockview + RCT theme overrides mapped to app tokens |
| Modify | `src/web/components/Layout.tsx` | New shell composition (ActivityBar + PanelGroup) |
| Modify | `src/web/pages/ProjectWorkspace.tsx` | Slim to: set active project + mount modals; body moves to sidebar/editor |
| Modify | `src/web/stores/ui.ts` | Remove mobile-sidebar; add sidebar section toggles |
| Modify | `src/web/main.tsx` | Import dockview CSS, RCT CSS, dockview-theme.css; configure Monaco loader |
| Modify | `vite.config.ts` | (if needed) Monaco worker / chunk config |
| Modify | `tests/e2e/responsive-ui.spec.ts` | Update selectors for removed Header/mobile sidebar |
| Delete | `src/web/components/Header.tsx` | Replaced by TitleBar |
| Delete | `src/web/components/Sidebar.tsx` | Replaced by ActivityBar + PrimarySidebar |
| Delete | `src/web/components/FileExplorerPanel.tsx` | Replaced by FileTree + MonacoFilePanel |
| Delete | `src/web/components/FilePreview.tsx` | Logic absorbed into MonacoFilePanel |

---

## Views & Actions Inventory (what each region does)

This is the functional spec for every region of the shell. Tasks below implement it; actions in **bold** already exist in the codebase and are reused verbatim (same API calls / store methods).

### A. TitleBar (top strip, ~28px) — `TitleBar.tsx`

| Element | Behaviour | Source |
|---------|-----------|--------|
| `RB` logo + "RemoteBridge" | Static brand | — |
| Connection dot | Green "Connected" / grey "Disconnected", driven by `useConfigStore().wsConnected`; pulses when connected | reuse Header logic |
| Exposure warning banner | Shows only when `config.host !== '127.0.0.1'`; **dismiss** persists in `localStorage` key `rb-exposure-warning-dismissed` | reuse Header logic |
| **Logout** | `api.logout()` → navigate `/login` | reuse |

### B. ActivityBar (far-left rail, 48px) — `ActivityBar.tsx`

| Element | Behaviour |
|---------|-----------|
| Project avatar (per project) | Click → `NavLink` to `/project/:id` (switches active project). Avatar = `initials()` on `projectColor()` background |
| Active indicator | Accent ring + left accent bar on the active project |
| Running indicator | Pulsing green dot if **any** session of that project is `running`/`launching` (reuse `isActive` from old Sidebar) |
| Hover tooltip | Fixed-position tip showing `name` + `path` (ported from old Sidebar) |
| **+ Add project** | Opens `AddProjectModal` via `setAddProjectOpen(true)` |
| **Settings** | `Link` to `/settings` |
| **Help** | External link to the GitHub repo (new tab) |

### C. PrimarySidebar (resizable, default 20%) — `PrimarySidebar.tsx`

Two collapsible sections + project-name header. Renders a hint when no project is active.

**C1. EXPLORER section** — `FileTree.tsx` (react-complex-tree)
| Action | Behaviour | API |
|--------|-----------|-----|
| Expand/collapse folder | Lazy-fetches children on first expand, caches after | `api.listProjectFiles(projectId, path)` |
| Click file (primary action) | Opens/focuses a Monaco tab in the editor area | `useEditorStore.openFile()` |
| Keyboard nav | Arrow keys, type-ahead, expand/collapse — built into RCT | RCT |
| **Refresh** (section header) | Remounts the tree (`treeKey++`) to re-fetch from root | local |
| Folder/file icons + indentation guides + chevron | Visual only | lucide |

**C2. SESSIONS section** — compact list of `SessionRow`
| Action | Behaviour |
|--------|-----------|
| Session rows | One `SessionRow` per session of the active project (full action set — see **E**) |
| **Shell here** (section header) | Opens a standalone terminal at project root: `sendWsMessage({ type:'terminal.create', payload:{ cwd: project.path, projectId } })` |
| Empty state | "No sessions yet." |

### D. EditorArea (center, dockview) — `EditorArea.tsx`

**D1. Sessions panel** (pinned tab, always present) — `SessionsPanel.tsx`
| Action | Behaviour | API |
|--------|-----------|-----|
| Sessions grouped by day | Day headers (Today/Yesterday/weekday) with per-day count | `dayLabel`, `compareSessions` |
| total / running counts | Header summary | — |
| **New session** | Opens `AgentSelectorModal` via `setAgentSelectorProjectId(projectId)` | reuse |
| **Clear stopped (N)** | Confirms, then bulk-**deletes** all `stopped`/`failed` sessions in parallel; partial-failure safe; toast on failures | `api.deleteSession` + `removeSession` |
| Session rows | Full action set — see **E** | — |

**D2. File panel** (one per open file, dynamic tabs) — `MonacoFilePanel.tsx`
| Action | Behaviour | API |
|--------|-----------|-----|
| Monaco editor | Syntax highlight by extension, minimap, line numbers | monaco |
| **Save** button / **Ctrl+S / Cmd+S** | Writes file; clears dirty marker; toast on error | `api.writeProjectFile` |
| Dirty indicator | Tab shows dirty state while `content !== saved` | `useEditorStore.setDirty` |
| Non-text fallback | `binary` / `too_large` / `directory` / `unsupported` show a message instead of an editor | `api.getProjectFilePreview` type |
| Tab drag / split | Drag tab to reorder or split editor into groups | dockview |
| Tab close | Removes the file tab; syncs back to `useEditorStore.closeTab` | dockview ↔ store |
| Re-open same file | Focuses the existing tab (no duplicate) | `openFile` dedupe |

### E. SessionRow actions (used in C2, D1) — `SessionRow.tsx` (reused as-is)

The action buttons are **conditional on session state**:

| Action | Shown when | Behaviour | API / store |
|--------|-----------|-----------|-------------|
| **Open Remote** | `running` AND `remoteLink` set | Opens `session.remoteLink` in a new tab (the agent's remote-control URL) | `<a target="_blank">` |
| **Stop** (□) | `running` | Stops the session | `api.stopSession` → `updateSession` |
| **Restart** (↻) | `stopped` OR `failed` | Relaunches the session | `api.restartSession` → `updateSession` |
| **Open terminal** (▣) | `running` OR `launching` (live) | Attaches to the session PTY and opens/focuses its terminal tab in the bottom panel | `terminal.attach` WS + `useTerminalsStore.addTab` |
| **Logs** (≡) | always | Opens the `LogsDrawer` for streamed logs | `setLogsSessionId(session.id)` |
| **Delete** (🗑) | `stopped` OR `failed` | Deletes the session record | `api.deleteSession` → `removeSession` |
| Status dot | always | Colour by state (`launching`/`running`/`stopped`/`failed`); running dot animates | — |
| Meta line | always | `running 5m` / `12:30 · ran 33m` + branch + `pid N`; failed shows error text | `meta()` |

### F. LogsDrawer (right overlay) — `LogsDrawer.tsx` (reused, modal-style)

| Action | Behaviour |
|--------|-----------|
| Log stream | Renders `session.logs`; lines containing URLs are highlighted as accent links; auto-scrolls to bottom on new lines |
| **Open Terminal** (live only) | Attaches to PTY → terminal tab, closes drawer |
| **Close** | Click backdrop or × → `setLogsSessionId(null)` |

> Cleanup opportunity: `LogsDrawer.openInTerminal` currently has `console.log` debug noise (lines 20-44). Remove during Task 11/14 since we're touching session UI — not required for functionality.

### G. TerminalPanel (bottom dock) — `TerminalPanel.tsx` (reused)

| Action | Behaviour |
|--------|-----------|
| Collapsed bar | "$ Terminal" button → opens a new standalone shell |
| **New shell** (+) | `terminal.create` at active project's `cwd` |
| Tab strip | Filtered to the active project; session terminals show `⚡ title`, standalone show `$ title` |
| Switch tab | `setActiveTab` |
| **Close tab** (×) | `terminal.close` (standalone) + `removeTab` |
| Drag handle | Resize panel height (clamped 15-80vh), persisted in store |
| **Hide** | Collapses the panel (`togglePanel`) |
| Tabs stay mounted | xterm state preserved across project switches; only active visible tab is shown |

### Cross-region interactions (data bridges)

- **FileTree → EditorArea:** click file → `useEditorStore.openFile` → `EditorArea` effect adds a dockview panel.
- **EditorArea → store:** dockview tab close/activate → `closeTab` / `setActive` (two-way sync).
- **SessionRow → TerminalPanel:** "Open terminal" / Logs "Open Terminal" → `terminal.attach` WS + `useTerminalsStore.addTab` → bottom panel opens.
- **SessionRow → LogsDrawer:** Logs → `setLogsSessionId` → drawer reads `useSessionsStore`.
- **ActivityBar / Sessions → modals:** Add project / New session → `useUIStore` flags → modals (mounted in `Layout`).

---

## Task 1: Editor store

**Files:**
- Create: `src/web/stores/editor.ts`

- [ ] **Step 1: Write the store**

```typescript
import { create } from 'zustand'

export interface EditorTab {
  id: string          // unique = `${projectId}:${path}`
  projectId: string
  path: string        // project-relative path
  title: string       // basename
  dirty: boolean
}

interface EditorStore {
  tabs: EditorTab[]
  activeTabId: string | null
  openFile: (projectId: string, path: string) => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
  setDirty: (id: string, dirty: boolean) => void
  closeProjectTabs: (projectId: string) => void
}

const tabId = (projectId: string, path: string) => `${projectId}:${path}`
const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export const useEditorStore = create<EditorStore>((set) => ({
  tabs: [],
  activeTabId: null,
  openFile: (projectId, path) => set(state => {
    const id = tabId(projectId, path)
    if (state.tabs.some(t => t.id === id)) return { activeTabId: id }
    return {
      tabs: [...state.tabs, { id, projectId, path, title: basename(path), dirty: false }],
      activeTabId: id
    }
  }),
  closeTab: (id) => set(state => {
    const tabs = state.tabs.filter(t => t.id !== id)
    const activeTabId = state.activeTabId === id
      ? (tabs.length ? tabs[tabs.length - 1].id : null)
      : state.activeTabId
    return { tabs, activeTabId }
  }),
  setActive: (id) => set({ activeTabId: id }),
  setDirty: (id, dirty) => set(state => ({
    tabs: state.tabs.map(t => t.id === id ? { ...t, dirty } : t)
  })),
  closeProjectTabs: (projectId) => set(state => {
    const tabs = state.tabs.filter(t => t.projectId !== projectId)
    return { tabs, activeTabId: tabs.length ? tabs[tabs.length - 1].id : null }
  })
}))
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `editor.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/web/stores/editor.ts
git commit -m "feat(web): add editor tabs store"
```

---

## Task 2: File tree data provider

**Files:**
- Create: `src/web/lib/fileTreeProvider.ts`

react-complex-tree needs a `TreeDataProvider`. We back it with `api.listProjectFiles`, caching each loaded level. Item ids are project-relative paths; the root item id is `''`.

- [ ] **Step 1: Write the provider**

```typescript
import type { TreeDataProvider, TreeItem, TreeItemIndex, Disposable } from 'react-complex-tree'
import { api } from './api'
import type { FileEntry } from '../../types'

export interface FileTreeData {
  entry: FileEntry | null   // null for the synthetic root
}

// Builds a TreeDataProvider for one project. Children of a folder are lazily
// fetched the first time the folder is expanded, then cached.
export function createFileTreeProvider(projectId: string): TreeDataProvider<FileTreeData> {
  const items = new Map<TreeItemIndex, TreeItem<FileTreeData>>()
  const listeners = new Set<(changed: TreeItemIndex[]) => void>()

  // Synthetic root
  items.set('', {
    index: '',
    isFolder: true,
    children: undefined,
    data: { entry: null }
  })

  const toItem = (entry: FileEntry): TreeItem<FileTreeData> => ({
    index: entry.path,
    isFolder: entry.type === 'directory',
    children: undefined,
    data: { entry }
  })

  const loadChildren = async (index: TreeItemIndex) => {
    const path = index === '' ? '' : String(index)
    const res = await api.listProjectFiles(projectId, path)
    const sorted = [...res.entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const e of sorted) if (!items.has(e.path)) items.set(e.path, toItem(e))
    const parent = items.get(index)
    if (parent) parent.children = sorted.map(e => e.path)
    return sorted.map(e => e.path)
  }

  return {
    async getTreeItem(index) {
      const item = items.get(index)
      if (item && (item.children !== undefined || !item.isFolder)) return item
      // Folder not yet loaded — load children then return.
      await loadChildren(index)
      return items.get(index)!
    },
    async getTreeItems(indices) {
      return Promise.all(indices.map(i => this.getTreeItem!(i)))
    },
    onDidChangeTreeData(listener): Disposable {
      listeners.add(listener)
      return { dispose: () => listeners.delete(listener) }
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `react-complex-tree` types differ slightly for `getTreeItems`/`Disposable`, adapt to the installed 2.6 typings — keep the lazy-load behaviour identical.)

- [ ] **Step 3: Commit**

```bash
git add src/web/lib/fileTreeProvider.ts
git commit -m "feat(web): add lazy file-tree data provider"
```

---

## Task 3: FileTree component

**Files:**
- Create: `src/web/components/FileTree.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useMemo } from 'react'
import { UncontrolledTreeEnvironment, Tree, type TreeItem } from 'react-complex-tree'
import { ChevronRight, Folder, FolderOpen, FileText } from 'lucide-react'
import { createFileTreeProvider, type FileTreeData } from '../lib/fileTreeProvider'
import { useEditorStore } from '../stores/editor'
import type { Project } from '../../types'

export default function FileTree({ project }: { project: Project }) {
  // Recreate the provider when the project changes so caches don't leak across projects.
  const dataProvider = useMemo(() => createFileTreeProvider(project.id), [project.id])
  const openFile = useEditorStore(s => s.openFile)

  return (
    <div className="rb-filetree rb-scrollbar min-h-0 flex-1 overflow-y-auto py-1 text-sm">
      <UncontrolledTreeEnvironment<FileTreeData>
        key={project.id}
        dataProvider={dataProvider}
        getItemTitle={(item) => item.data.entry?.name ?? project.name}
        viewState={{ ['file-tree']: {} }}
        canDragAndDrop={false}
        onPrimaryAction={(item: TreeItem<FileTreeData>) => {
          const entry = item.data.entry
          if (entry && entry.type !== 'directory') openFile(project.id, entry.path)
        }}
        renderItemArrow={({ item, context }) =>
          item.isFolder ? (
            <ChevronRight
              size={14}
              className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${context.isExpanded ? 'rotate-90' : ''}`}
            />
          ) : <span className="w-[14px] shrink-0" />
        }
        renderItemTitle={({ item, title }) => {
          const isFolder = item.isFolder
          const Icon = isFolder ? Folder : FileText
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon size={15} className="shrink-0 text-[var(--color-text-muted)]" />
              <span className="truncate">{title}</span>
            </span>
          )
        }}
        renderItem={({ item, depth, children, title, arrow, context }) => (
          <li {...context.itemContainerWithChildrenProps}>
            <div
              {...context.itemContainerWithoutChildrenProps}
              {...context.interactiveElementProps}
              style={{ paddingLeft: 4 + depth * 12 }}
              className={`flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-[3px] transition-colors ${
                context.isSelected
                  ? 'bg-[var(--color-accent-glow)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
              }`}
            >
              {arrow}{title}
            </div>
            {children}
          </li>
        )}
      >
        <Tree treeId="file-tree" rootItem="" treeLabel={`${project.name} files`} />
      </UncontrolledTreeEnvironment>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Adjust render-prop signatures to the installed RCT 2.6 API if the compiler flags differences (the structure above matches RCT 2.x; `FolderOpen` import may be unused — remove if so).

- [ ] **Step 3: Commit**

```bash
git add src/web/components/FileTree.tsx
git commit -m "feat(web): add VS Code-style file tree"
```

---

## Task 4: Monaco file panel

**Files:**
- Create: `src/web/components/MonacoFilePanel.tsx`

Absorbs `FilePreview.tsx` logic (Ctrl+S, dirty tracking, non-text fallbacks) but uses Monaco.

- [ ] **Step 1: Write the language helper + component**

```tsx
import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Loader2, Save, Binary, FileCode2 } from 'lucide-react'
import { api } from '../lib/api'
import { useEditorStore } from '../stores/editor'
import { useUIStore } from '../stores/ui'
import type { FilePreviewResult } from '../../types'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html',
  py: 'python', go: 'go', rs: 'rust', java: 'java', sh: 'shell', yml: 'yaml',
  yaml: 'yaml', toml: 'ini', sql: 'sql', xml: 'xml'
}
const langFor = (path: string) => EXT_LANG[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'

export default function MonacoFilePanel({ tabId, projectId, path }: {
  tabId: string; projectId: string; path: string
}) {
  const [preview, setPreview] = useState<FilePreviewResult | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savedRef = useRef('')
  const setDirty = useEditorStore(s => s.setDirty)
  const addToast = useUIStore(s => s.addToast)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    api.getProjectFilePreview(projectId, path)
      .then(res => {
        if (cancelled) return
        setPreview(res)
        if (res.type === 'text') { setContent(res.content); savedRef.current = res.content }
      })
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : 'Cannot preview file'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [projectId, path])

  const dirty = preview?.type === 'text' && content !== savedRef.current
  useEffect(() => { setDirty(tabId, dirty) }, [dirty, tabId, setDirty])

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await api.writeProjectFile(projectId, path, content)
      savedRef.current = content
      setDirty(tabId, false)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Cannot save file')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Centered><Loader2 size={16} className="animate-spin" /> Loading…</Centered>
  if (error) return <Centered className="text-[var(--color-failed)]">{error}</Centered>
  if (preview && preview.type !== 'text') {
    return (
      <Centered>
        {preview.type === 'binary' ? <Binary size={16} /> : <FileCode2 size={16} />}
        {preview.type === 'too_large' ? 'File too large to preview.' :
         preview.type === 'directory' ? 'This is a directory.' :
         'Preview not available for this file.'}
      </Centered>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-base)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
        <span className="rb-mono truncate text-[11px] text-[var(--color-text-muted)]">{path}</span>
        <button type="button" onClick={save} disabled={!dirty || saving}
          className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1 text-xs transition-all ${
            dirty ? 'bg-[var(--color-accent)] text-white hover:brightness-110'
                  : 'cursor-not-allowed text-[var(--color-text-muted)]'}`}
          title="Save (Ctrl+S)">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          theme="vs-dark"
          language={langFor(path)}
          value={content}
          onChange={(v) => setContent(v ?? '')}
          onMount={(editor, monaco) => {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { void save() })
          }}
          options={{ fontSize: 12, minimap: { enabled: true }, scrollBeyondLastLine: false, automaticLayout: true }}
        />
      </div>
    </div>
  )
}

function Centered({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-full items-center justify-center gap-2 bg-[var(--color-bg-base)] text-xs text-[var(--color-text-muted)] ${className}`}>
      {children}
    </div>
  )
}
```

> Note: `onMount`'s `save` closure captures the first render's state. Because `save` reads `content`/`dirty` from closure, register the command with a ref-based latest-save instead if Ctrl+S inside Monaco saves stale content. Simplest fix: store `save` in a ref updated each render and call `saveRef.current()` in the command. Implement that ref if manual testing shows stale saves.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/MonacoFilePanel.tsx
git commit -m "feat(web): add Monaco file editor panel"
```

---

## Task 5: Sessions panel

**Files:**
- Create: `src/web/components/SessionsPanel.tsx`

Extracts the sessions list (grouped by day) from current `ProjectWorkspace.tsx` so it can live as a dockview panel. Reuses `SessionRow`, `compareSessions`, `dayLabel`.

- [ ] **Step 1: Write the component** (port lines 26-124 of current `ProjectWorkspace.tsx`)

```tsx
import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import SessionRow from './SessionRow'
import { compareSessions, dayLabel } from '../lib/format'
import type { Project, Session } from '../../types'

export default function SessionsPanel({ project }: { project: Project }) {
  const { sessions, removeSession } = useSessionsStore()
  const { setAgentSelectorProjectId, addToast } = useUIStore()
  const [clearing, setClearing] = useState(false)

  const groups = useMemo(() => {
    const mine = sessions.filter(s => s.projectId === project.id)
    const byDay = new Map<string, Session[]>()
    for (const s of [...mine].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
      const key = dayLabel(s.startedAt)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(s)
    }
    for (const [, arr] of byDay) arr.sort(compareSessions)
    return [...byDay.entries()]
  }, [sessions, project.id])

  const total = groups.reduce((n, [, arr]) => n + arr.length, 0)
  const running = sessions.filter(s => s.projectId === project.id && (s.state === 'running' || s.state === 'launching')).length
  const clearable = useMemo(
    () => sessions.filter(s => s.projectId === project.id && (s.state === 'stopped' || s.state === 'failed')),
    [sessions, project.id]
  )

  const clearStopped = async () => {
    if (!clearable.length || clearing) return
    if (!window.confirm(`Delete ${clearable.length} stopped session(s)? This cannot be undone.`)) return
    setClearing(true)
    const results = await Promise.allSettled(clearable.map(async s => {
      await api.deleteSession(s.id); removeSession(s.id)
    }))
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed) addToast(`Failed to delete ${failed} session(s)`)
    setClearing(false)
  }

  return (
    <div className="rb-scrollbar h-full overflow-y-auto bg-[var(--color-bg-base)] p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Sessions</h2>
          <div className="flex items-center gap-3">
            {clearable.length > 0 && (
              <button type="button" onClick={clearStopped} disabled={clearing}
                className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-failed)] disabled:opacity-50">
                <Trash2 size={13} /> {clearing ? 'Clearing…' : `Clear stopped (${clearable.length})`}
              </button>
            )}
            <span className="text-xs text-[var(--color-text-muted)]">
              {total} total{running > 0 && <span className="text-[var(--color-running)]"> · {running} running</span>}
            </span>
            <button type="button" onClick={() => setAgentSelectorProjectId(project.id)} className="rb-primary-button gap-1.5 px-3">
              <Plus size={14} /> New session
            </button>
          </div>
        </div>
        {total === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">No sessions yet</p>
            <p className="text-xs text-[var(--color-text-muted)]">Launch one with “New session”.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {groups.map(([day, items]) => (
              <div key={day} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3 px-1">
                  <span className="shrink-0 text-xs font-medium text-[var(--color-text-secondary)]">{day}</span>
                  <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">{items.length}</span>
                </div>
                <div className="divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/40">
                  {items.map(s => <SessionRow key={s.id} session={s} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/SessionsPanel.tsx
git commit -m "feat(web): extract SessionsPanel from ProjectWorkspace"
```

---

## Task 6: EditorArea (dockview host)

**Files:**
- Create: `src/web/components/EditorArea.tsx`

dockview hosts panels. A pinned "Sessions" panel is always present; file panels are added/removed as `useEditorStore.tabs` change. We sync the dockview API imperatively from the store.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useRef } from 'react'
import { DockviewReact, type DockviewReadyEvent, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { useEditorStore } from '../stores/editor'
import { useProjectsStore } from '../stores/projects'
import MonacoFilePanel from './MonacoFilePanel'
import SessionsPanel from './SessionsPanel'

function SessionsPanelHost(props: IDockviewPanelProps<{ projectId: string }>) {
  const project = useProjectsStore(s => s.projects.find(p => p.id === props.params.projectId))
  if (!project) return null
  return <SessionsPanel project={project} />
}

function FilePanelHost(props: IDockviewPanelProps<{ tabId: string; projectId: string; path: string }>) {
  return <MonacoFilePanel tabId={props.params.tabId} projectId={props.params.projectId} path={props.params.path} />
}

const components = { sessions: SessionsPanelHost, file: FilePanelHost }

export default function EditorArea({ projectId }: { projectId: string }) {
  const apiRef = useRef<DockviewApi | null>(null)
  const tabs = useEditorStore(s => s.tabs)
  const activeTabId = useEditorStore(s => s.activeTabId)
  const setActive = useEditorStore(s => s.setActive)
  const closeTab = useEditorStore(s => s.closeTab)

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api
    event.api.addPanel({ id: 'sessions', component: 'sessions', params: { projectId }, title: 'Sessions' })
    // Reflect dockview tab activation/closing back into the store.
    event.api.onDidActivePanelChange(p => { if (p && p.id !== 'sessions') setActive(p.id) })
    event.api.onDidRemovePanel(p => { if (p.id !== 'sessions') closeTab(p.id) })
  }

  // Sync store tabs → dockview panels.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    for (const tab of tabs) {
      if (!api.getPanel(tab.id)) {
        api.addPanel({ id: tab.id, component: 'file',
          params: { tabId: tab.id, projectId: tab.projectId, path: tab.path },
          title: tab.title })
      }
    }
    for (const panel of api.panels) {
      if (panel.id !== 'sessions' && !tabs.some(t => t.id === panel.id)) api.removePanel(panel)
    }
  }, [tabs])

  // Sync store active tab → dockview.
  useEffect(() => {
    const api = apiRef.current
    if (!api || !activeTabId) return
    api.getPanel(activeTabId)?.api.setActive()
  }, [activeTabId])

  return (
    <DockviewReact
      className="dockview-theme-rb h-full"
      components={components}
      onReady={onReady}
    />
  )
}
```

> Note: dockview 6 panel title updates (dirty marker) can be applied via `panel.api.setTitle(...)`. Add a `★`/`●` prefix when `tab.dirty` if desired during the theming pass; not required for first working version.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Adapt `addPanel`/event names to installed dockview 6.6 typings if the compiler flags them (API names above match dockview 6.x).

- [ ] **Step 3: Commit**

```bash
git add src/web/components/EditorArea.tsx
git commit -m "feat(web): add dockview editor area"
```

---

## Task 7: ActivityBar

**Files:**
- Create: `src/web/components/ActivityBar.tsx`

Port project icons + running dot + tooltips from current `Sidebar.tsx` (lines 119-147 & 27-34) into a 48px rail.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Plus, Settings, HelpCircle } from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { initials, projectColor } from '../lib/format'

export default function ActivityBar() {
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const setAddProjectOpen = useUIStore(s => s.setAddProjectOpen)
  const [tip, setTip] = useState<{ label: string; y: number } | null>(null)

  const running = (id: string) =>
    sessions.some(s => s.projectId === id && (s.state === 'launching' || s.state === 'running'))
  const show = (label: string, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTip({ label, y: r.top + r.height / 2 })
  }

  return (
    <aside aria-label="Projects" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] py-2">
      <div className="rb-scrollbar flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {projects.map(p => (
          <NavLink key={p.id} to={`/project/${p.id}`} title={`${p.name}\n${p.path}`}
            onMouseEnter={e => show(p.name, e)} onMouseLeave={() => setTip(null)}
            className={({ isActive }) =>
              `relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-xs font-semibold text-white transition-all ${isActive ? 'ring-2 ring-[var(--color-accent)]' : 'opacity-80 hover:opacity-100'}`}
            style={{ backgroundColor: projectColor(p.id) }}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-2 h-5 w-0.5 rounded-r bg-[var(--color-accent)]" />}
                {initials(p.name)}
                {running(p.id) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-bg-surface)] bg-[var(--color-running)]" style={{ animation: 'rb-pulse 3s ease-in-out infinite' }} />}
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={() => setAddProjectOpen(true)} aria-label="Add project" title="Add project"
          onMouseEnter={e => show('Add project', e)} onMouseLeave={() => setTip(null)}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]">
          <Plus size={18} />
        </button>
      </div>
      <div className="flex flex-col items-center gap-1 border-t border-[var(--color-border-subtle)] pt-2">
        <Link to="/settings" title="Settings" onMouseEnter={e => show('Settings', e)} onMouseLeave={() => setTip(null)}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
          <Settings size={18} />
        </Link>
        <a href="https://github.com/sowndev/remotebridge" target="_blank" rel="noopener noreferrer" title="Help"
          onMouseEnter={e => show('Help', e)} onMouseLeave={() => setTip(null)}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
          <HelpCircle size={18} />
        </a>
      </div>
      {tip && (
        <span className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-2 py-1 text-xs text-[var(--color-text-primary)] shadow-[var(--shadow-modal)]"
          style={{ left: 52, top: tip.y }}>{tip.label}</span>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/ActivityBar.tsx
git commit -m "feat(web): add VS Code-style activity bar"
```

---

## Task 8: PrimarySidebar

**Files:**
- Create: `src/web/components/PrimarySidebar.tsx`

EXPLORER (FileTree) + SESSIONS sections. Active project comes from the route.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { useMatch } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw, TerminalSquare } from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { sendWsMessage } from '../lib/ws'
import FileTree from './FileTree'
import SessionRow from './SessionRow'
import { compareSessions } from '../lib/format'

function Section({ title, defaultOpen = true, actions, children }: {
  title: string; defaultOpen?: boolean; actions?: React.ReactNode; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex flex-1 items-center gap-1 hover:text-[var(--color-text-primary)]">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{title}
        </button>
        {open && actions}
      </div>
      {open && children}
    </div>
  )
}

export default function PrimarySidebar() {
  const match = useMatch('/project/:projectId')
  const projectId = match?.params.projectId
  const project = useProjectsStore(s => s.projects.find(p => p.id === projectId))
  const sessions = useSessionsStore(s => s.sessions)
  const setAgentSelectorProjectId = useUIStore(s => s.setAgentSelectorProjectId)
  const [treeKey, setTreeKey] = useState(0)

  if (!project) {
    return <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-[var(--color-text-muted)]">Select a project from the activity bar.</div>
  }

  const mine = [...sessions.filter(s => s.projectId === project.id)].sort(compareSessions)
  const openShell = () => sendWsMessage({ type: 'terminal.create', payload: { cwd: project.path, projectId: project.id } })

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-surface)]">
      <div className="flex h-8 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">{project.name}</div>
      <div className="flex min-h-0 flex-[2] flex-col border-t border-[var(--color-border-subtle)]">
        <Section title="Explorer" actions={
          <button type="button" onClick={() => setTreeKey(k => k + 1)} title="Refresh" className="rb-icon-button h-5 min-h-5 w-5 min-w-5">
            <RefreshCw size={12} />
          </button>
        }>
          <FileTree key={treeKey} project={project} />
        </Section>
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--color-border-subtle)]">
        <Section title="Sessions" actions={
          <button type="button" onClick={openShell} title="Shell here" className="rb-icon-button h-5 min-h-5 w-5 min-w-5">
            <TerminalSquare size={12} />
          </button>
        }>
          <div className="rb-scrollbar min-h-0 flex-1 overflow-y-auto">
            {mine.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--color-text-muted)]">No sessions yet.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {mine.map(s => <SessionRow key={s.id} session={s} />)}
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
```

> Note: confirm `SessionRow` renders acceptably in the narrow sidebar. If it overflows, the Sessions list here can show a compact row and rely on the full `SessionsPanel` in the editor area. Decide during the theming pass.

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/PrimarySidebar.tsx
git commit -m "feat(web): add primary sidebar with explorer + sessions"
```

---

## Task 9: TitleBar

**Files:**
- Create: `src/web/components/TitleBar.tsx`

Moves the exposure warning + connection status + logout out of the deleted Header into a slim top bar.

- [ ] **Step 1: Write the component** (port logic from `Header.tsx` lines 8-46, 69-83)

```tsx
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useConfigStore } from '../stores/config'

const WARNING_DISMISSED_KEY = 'rb-exposure-warning-dismissed'

export default function TitleBar() {
  const { wsConnected, config } = useConfigStore()
  const navigate = useNavigate()
  const publicHost = Boolean(config?.host && config.host !== '127.0.0.1')
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(WARNING_DISMISSED_KEY) === '1')

  const logout = async () => { await api.logout().catch(() => {}); navigate('/login') }

  return (
    <div className="shrink-0">
      {publicHost && !dismissed && (
        <div className="flex min-h-8 items-center gap-2 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-warning)]">Warning</span>
          <span className="min-w-0 flex-1 truncate">RemoteBridge is exposed on {config?.host}. Ensure your firewall and password are configured.</span>
          <button type="button" onClick={() => { localStorage.setItem(WARNING_DISMISSED_KEY, '1'); setDismissed(true) }} aria-label="Dismiss warning" className="rb-icon-button h-6 w-6">×</button>
        </div>
      )}
      <header role="banner" className="flex h-8 items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-dim)] font-mono text-[10px] font-semibold text-[var(--color-accent)]">RB</span>
          <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">RemoteBridge</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-[var(--color-running)]' : 'bg-[var(--color-stopped)]'}`} style={wsConnected ? { animation: 'rb-pulse 3s ease-in-out infinite' } : undefined} />
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
          <button type="button" onClick={logout} aria-label="Logout" title="Logout" className="rb-icon-button h-6 w-6"><LogOut size={15} /></button>
        </div>
      </header>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/TitleBar.tsx
git commit -m "feat(web): add slim title bar"
```

---

## Task 10: Rewrite Layout shell

**Files:**
- Modify: `src/web/components/Layout.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { useMatch } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import TitleBar from './TitleBar'
import ActivityBar from './ActivityBar'
import PrimarySidebar from './PrimarySidebar'
import EditorArea from './EditorArea'
import TerminalPanel from './TerminalPanel'
import Toaster from './Toaster'

export default function Layout({ children }: { children: React.ReactNode }) {
  const match = useMatch('/project/:projectId')
  const projectId = match?.params.projectId ?? null

  return (
    <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar />
        <PanelGroup direction="horizontal" autoSaveId="rb-shell">
          <Panel defaultSize={20} minSize={12} maxSize={34} className="min-w-0">
            <PrimarySidebar />
          </Panel>
          <PanelResizeHandle className="w-px bg-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-accent)] data-[resize-handle-state=drag]:bg-[var(--color-accent)]" />
          <Panel minSize={40} className="min-w-0">
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                {projectId ? <EditorArea projectId={projectId} /> : <div className="h-full">{children}</div>}
              </div>
              <TerminalPanel />
            </div>
          </Panel>
        </PanelGroup>
      </div>
      <Toaster />
    </div>
  )
}
```

> The non-project routes (`/`, `/settings`) keep rendering `children` (Overview, SettingsPage) in the main area; project routes render the dockview `EditorArea` instead. `ProjectWorkspace` (Task 11) renders nothing visible itself but still mounts the modals.

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` — Expected: errors only from files not yet updated (resolved by Task 11/12). Re-run after those.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/Layout.tsx
git commit -m "feat(web): rebuild Layout into VS Code shell"
```

---

## Task 11: Slim ProjectWorkspace + render modals globally

**Files:**
- Modify: `src/web/pages/ProjectWorkspace.tsx`

The page body now lives in the sidebar/editor area. The page still validates the project and mounts the modals (which are project-agnostic singletons driven by the store).

- [ ] **Step 1: Replace the file contents**

```tsx
import { Navigate, useParams } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'

export default function ProjectWorkspace() {
  const { projectId } = useParams()
  const { projects } = useProjectsStore()
  const project = projects.find(p => p.id === projectId)

  if (!project) {
    return projects.length === 0
      ? <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
      : <Navigate to="/" replace />
  }

  // The visible workspace (explorer/sessions/editor) is rendered by Layout's
  // sidebar + dockview editor area. This page only mounts the modals.
  return (
    <>
      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
```

> Because `Layout` renders `EditorArea` (not `children`) on project routes, the modals returned here are NOT in the DOM on project routes. Fix: move the three modals into `Layout` so they mount on every route. Apply this in Step 2.

- [ ] **Step 2: Mount modals in Layout instead**

Edit `src/web/components/Layout.tsx`: import `AgentSelectorModal`, `AddProjectModal`, `LogsDrawer` and render them right before `<Toaster />`. Then reduce `ProjectWorkspace` to only the project-validity check returning `null` on success:

```tsx
// ProjectWorkspace.tsx final body after modals moved to Layout:
export default function ProjectWorkspace() {
  const { projectId } = useParams()
  const { projects } = useProjectsStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) {
    return projects.length === 0
      ? <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
      : <Navigate to="/" replace />
  }
  return null
}
```

- [ ] **Step 3: Typecheck** — Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/web/pages/ProjectWorkspace.tsx src/web/components/Layout.tsx
git commit -m "refactor(web): move workspace body into shell, mount modals globally"
```

---

## Task 12: Update UI store

**Files:**
- Modify: `src/web/stores/ui.ts`

Remove `mobileSidebarOpen` / `sidebarCollapsed` / `toggleSidebar` (no longer used after Header/Sidebar deletion). Keep modal + toast state.

- [ ] **Step 1: Edit the store** — remove `mobileSidebarOpen`, `sidebarCollapsed`, `setMobileSidebarOpen`, `toggleSidebar`, the `COLLAPSE_KEY` block; change `setAgentSelectorProjectId` to `set({ agentSelectorProjectId: id })` (drop the `mobileSidebarOpen: false`).

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` — Expected: no errors (confirms nothing else references the removed fields).

- [ ] **Step 3: Commit**

```bash
git add src/web/stores/ui.ts
git commit -m "refactor(web): drop mobile-sidebar UI state"
```

---

## Task 13: CSS — import + theme dockview & RCT

**Files:**
- Create: `src/web/styles/dockview-theme.css`
- Modify: `src/web/main.tsx`

- [ ] **Step 1: Import library CSS in `main.tsx`** (top of file, before app CSS)

```tsx
import 'dockview/dist/styles/dockview.css'
import 'react-complex-tree/lib/style-modern.css'
import './styles/dockview-theme.css'
```

- [ ] **Step 2: Write `dockview-theme.css`** mapping dockview's theme vars to app tokens

```css
/* dockview theme bound to RemoteBridge tokens */
.dockview-theme-rb {
  --dv-background-color: var(--color-bg-base);
  --dv-group-view-background-color: var(--color-bg-base);
  --dv-tabs-and-actions-container-background-color: var(--color-bg-surface);
  --dv-activegroup-visiblepanel-tab-background-color: var(--color-bg-base);
  --dv-inactivegroup-visiblepanel-tab-background-color: var(--color-bg-surface);
  --dv-tab-divider-color: var(--color-border-subtle);
  --dv-separator-border: var(--color-border-subtle);
  --dv-activegroup-visiblepanel-tab-color: var(--color-text-primary);
  --dv-inactivegroup-visiblepanel-tab-color: var(--color-text-muted);
  --dv-active-sash-color: var(--color-accent);
}

/* react-complex-tree bound to app tokens */
.rb-filetree {
  --rct-color-tree-bg: transparent;
  --rct-item-height: 24px;
  --rct-color-focustree-item-selected-bg: var(--color-accent-glow);
  --rct-color-focustree-item-hover-bg: var(--color-bg-hover);
  --rct-color-tree-focus-outline: transparent;
  --rct-color-arrow: var(--color-text-muted);
}
.rb-filetree ul { list-style: none; margin: 0; padding: 0; }
```

> Verify the exact RCT CSS filename in `node_modules/react-complex-tree/lib/` (it ships `style-modern.css`); adjust the import if the installed version differs. Confirm dockview ships `dist/styles/dockview.css`.

- [ ] **Step 3: Build to confirm CSS resolves**

Run: `npm run build:web`
Expected: build succeeds; no "cannot resolve" errors for the CSS imports.

- [ ] **Step 4: Commit**

```bash
git add src/web/main.tsx src/web/styles/dockview-theme.css
git commit -m "style(web): theme dockview and file tree to app tokens"
```

---

## Task 14: Delete dead components

**Files:**
- Delete: `src/web/components/Header.tsx`, `Sidebar.tsx`, `FileExplorerPanel.tsx`, `FilePreview.tsx`

- [ ] **Step 1: Confirm no imports remain**

Run: `grep -rn "Header\|Sidebar\|FileExplorerPanel\|FilePreview" src/web --include=*.tsx --include=*.ts | grep -i import`
Expected: no results (TitleBar/ActivityBar/PrimarySidebar replaced them).

- [ ] **Step 2: Delete the files**

```bash
git rm src/web/components/Header.tsx src/web/components/Sidebar.tsx src/web/components/FileExplorerPanel.tsx src/web/components/FilePreview.tsx
```

- [ ] **Step 3: Typecheck + build** — Run: `npx tsc --noEmit && npm run build:web` — Expected: success.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(web): remove components superseded by VS Code shell"
```

---

## Task 15: Configure Monaco workers (Vite)

**Files:**
- Modify: `src/web/main.tsx` (or `vite.config.ts`)

`@monaco-editor/react` by default loads Monaco from a CDN. For a self-hosted/offline-friendly build, point its loader at the bundled `monaco-editor` and ensure workers resolve.

- [ ] **Step 1: Configure the loader in `main.tsx`** (before rendering the app)

```tsx
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'

;(self as any).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}
loader.config({ monaco })
```

- [ ] **Step 2: Build and inspect chunks**

Run: `npm run build:web`
Expected: build succeeds; Monaco appears as separate chunk(s)/worker files in `dist` output (not inlined into the main entry).

- [ ] **Step 3: Commit**

```bash
git add src/web/main.tsx
git commit -m "build(web): self-host Monaco workers via Vite"
```

---

## Task 16: Update e2e tests + full verification

**Files:**
- Modify: `tests/e2e/responsive-ui.spec.ts`

- [ ] **Step 1: Read the current spec and identify selectors that target the removed Header / mobile sidebar / old FileExplorerPanel**

Run: `grep -n "Menu\|Open project navigation\|mobileSidebar\|Files\|Select a file\|aria-label" tests/e2e/responsive-ui.spec.ts`

- [ ] **Step 2: Update selectors** to the new shell: project icons in `aside[aria-label="Projects"]`, EXPLORER section, file tree items, Monaco editor (`.monaco-editor`), Terminal button. Remove assertions about the mobile hamburger / collapsible sidebar that no longer exist.

- [ ] **Step 3: Run unit tests** — Run: `npm test` — Expected: PASS.

- [ ] **Step 4: Run dev server and manually verify** (checklist below) — Run: `npm run dev`

- [ ] **Step 5: Run responsive e2e** — Run: `npm run test:responsive` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/responsive-ui.spec.ts
git commit -m "test(web): update e2e for VS Code shell"
```

---

## Manual Verification Checklist (run with `npm run dev`)

1. TitleBar shows logo + Connected dot; exposure warning appears only on public host and dismisses.
2. ActivityBar lists project avatars; clicking switches project; active project has accent bar; running project shows pulsing dot; hover shows tooltip; "+" opens Add Project modal.
3. EXPLORER lazy-loads folders on expand — verify network calls hit `/api/projects/:id/files?path=…` only on first expand of each folder.
4. Clicking a file opens a Monaco tab with syntax highlighting; clicking the same file again focuses the existing tab (no duplicate).
5. Open 2+ files → dockview tabs are draggable; dragging a tab splits the editor; closing a tab in dockview removes it from the store (and vice versa).
6. Edit a file, press Ctrl/Cmd+S inside Monaco → saved (network PUT to `/files`), tab dirty marker clears; the Save button also works.
7. Non-text files (binary/too_large/unsupported) show the correct fallback message, not a broken editor.
8. SESSIONS section + Sessions panel show sessions grouped correctly; `SessionRow` actions (stop/restart/logs/terminal) still work; "Clear stopped" works; "New session" opens the agent selector.
9. Terminal panel still opens at the bottom, attaches to sessions, drag-resizes, and filters tabs by active project.
10. Sidebar ↔ editor resize handle works and persists (react-resizable-panels `autoSaveId`).
11. Theme: dockview tabs, file tree, and Monaco all match the dark palette — no white default chrome anywhere.
12. `/` (Overview) and `/settings` routes still render correctly in the main area (children path).

---

## Self-Review Notes

- **Spec coverage:** ActivityBar (Task 7), EXPLORER file tree (Tasks 2-3), Monaco editor (Tasks 4, 15), dockview tabs (Task 6), SESSIONS (Tasks 5, 8), terminal bottom (reused), shell composition (Task 10) — all spec items mapped.
- **Type consistency:** `EditorTab.id = ${projectId}:${path}` used consistently across editor store, EditorArea panel ids, and MonacoFilePanel `tabId`. `createFileTreeProvider(projectId)` ↔ `FileTree` ↔ provider all agree on project-relative path ids with `''` root.
- **Known risks called out inline:** Monaco Ctrl+S stale-closure (Task 4 note), RCT/dockview exact type & CSS filenames may need adapting to installed 2.6/6.6 versions (noted in Tasks 2, 3, 6, 13), SessionRow width in narrow sidebar (Task 8 note).
- **No mobile:** mobile sidebar removed deliberately (desktop-first control panel); e2e updated in Task 16.
