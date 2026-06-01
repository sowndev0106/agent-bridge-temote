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
    event.api.onDidActivePanelChange(p => { if (p && p.id !== 'sessions') setActive(p.id) })
    event.api.onDidRemovePanel(p => { if (p.id !== 'sessions') closeTab(p.id) })
  }

  // Sync store tabs → dockview panels.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    for (const tab of tabs) {
      if (!api.getPanel(tab.id)) {
        api.addPanel({
          id: tab.id,
          component: 'file',
          params: { tabId: tab.id, projectId: tab.projectId, path: tab.path },
          title: tab.title
        })
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
