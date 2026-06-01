import { Suspense, lazy, useEffect, useRef } from 'react'
import { DockviewReact, type DockviewReadyEvent, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { useEditorStore } from '../stores/editor'
import { useProjectsStore } from '../stores/projects'
import SessionsPanel from './SessionsPanel'

// Lazy-load the Monaco panel so monaco-editor lands in its own async chunk,
// fetched only when the user opens a file (keeps the initial bundle small).
const MonacoFilePanel = lazy(() => import('./MonacoFilePanel'))
const MonacoDiffPanel = lazy(() => import('./MonacoDiffPanel'))
import CodexChatPanel from './CodexChatPanel'
const SESSIONS_PANEL_ID = 'sessions'

function SessionsPanelHost(props: IDockviewPanelProps<{ projectId: string }>) {
  const project = useProjectsStore(s => s.projects.find(p => p.id === props.params.projectId))
  if (!project) return null
  return <SessionsPanel project={project} />
}

function FilePanelHost(props: IDockviewPanelProps<{ tabId: string; projectId: string; path: string; type?: 'edit' | 'diff' | 'codex' }>) {
  const type = props.params.type || 'edit'
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-[var(--color-bg-base)] text-xs text-[var(--color-text-muted)]">Loading editor…</div>}>
      {type === 'diff' ? (
        <MonacoDiffPanel tabId={props.params.tabId} projectId={props.params.projectId} path={props.params.path} />
      ) : (
        <MonacoFilePanel tabId={props.params.tabId} projectId={props.params.projectId} path={props.params.path} />
      )}
    </Suspense>
  )
}

function CodexPanelHost(props: IDockviewPanelProps<{ sessionId: string }>) {
  return <CodexChatPanel sessionId={props.params.sessionId} />
}

const components = { sessions: SessionsPanelHost, file: FilePanelHost, codex: CodexPanelHost }

export default function EditorArea({ projectId }: { projectId: string }) {
  const apiRef = useRef<DockviewApi | null>(null)
  const tabs = useEditorStore(s => s.tabs)
  const activeTabId = useEditorStore(s => s.activeTabId)
  const setActive = useEditorStore(s => s.setActive)
  const closeTab = useEditorStore(s => s.closeTab)

  const ensureSessionsPanel = (api: DockviewApi) => {
    const existing = api.getPanel(SESSIONS_PANEL_ID)
    if (existing) {
      existing.api.setActive()
      return
    }

    api.addPanel({
      id: SESSIONS_PANEL_ID,
      component: 'sessions',
      params: { projectId },
      title: 'Sessions'
    })
  }

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api
    ensureSessionsPanel(event.api)
    event.api.onDidActivePanelChange(p => { if (p && p.id !== SESSIONS_PANEL_ID) setActive(p.id) })
    event.api.onDidRemovePanel(p => {
      if (p.id !== SESSIONS_PANEL_ID) {
        closeTab(p.id)
      }

      queueMicrotask(() => {
        const api = apiRef.current
        if (api && useEditorStore.getState().tabs.length === 0) {
          ensureSessionsPanel(api)
        }
      })
    })
  }

  // Sync store tabs → dockview panels.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    for (const tab of tabs) {
      if (!api.getPanel(tab.id)) {
        api.addPanel({
          id: tab.id,
          component: tab.type === 'codex' ? 'codex' : 'file',
          params: { tabId: tab.id, projectId: tab.projectId, path: tab.path, type: tab.type, sessionId: tab.sessionId },
          title: tab.title
        })
      }
    }
    for (const panel of api.panels) {
      if (panel.id !== SESSIONS_PANEL_ID && !tabs.some(t => t.id === panel.id)) api.removePanel(panel)
    }
    if (tabs.length === 0) {
      ensureSessionsPanel(api)
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
