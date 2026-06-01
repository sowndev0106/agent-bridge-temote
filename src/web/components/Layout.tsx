import { useState, useEffect } from 'react'
import { useMatch } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
import TitleBar from './TitleBar'
import ActivityBar from './ActivityBar'
import PrimarySidebar from './PrimarySidebar'
import MobileSidebar from './MobileSidebar'
import EditorArea from './EditorArea'
import TerminalPanel from './TerminalPanel'
import Toaster from './Toaster'
import AgentSelectorModal from './AgentSelectorModal'
import AddProjectModal from './AddProjectModal'
import DeleteProjectModal from './DeleteProjectModal'
import LogsDrawer from './LogsDrawer'
import CodexRemoteModal from './CodexRemoteModal'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    setIsMobile(media.matches)
    const listener = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  return isMobile
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const match = useMatch('/project/:projectId')
  const projectId = match?.params.projectId ?? null
  const isMobile = useIsMobile()

  return (
    <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isMobile && <ActivityBar />}
        {isMobile ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {projectId ? <EditorArea projectId={projectId} /> : <div className="h-full">{children}</div>}
            </div>
            <TerminalPanel />
          </div>
        ) : (
          <Group orientation="horizontal" className="min-w-0 flex-1">
            <Panel defaultSize="20%" minSize="12%" maxSize="34%" className="min-w-0">
              <PrimarySidebar />
            </Panel>
            <Separator className="w-1 shrink-0 cursor-col-resize bg-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-accent)] focus-visible:bg-[var(--color-accent)] active:bg-[var(--color-accent)]" />
            <Panel minSize="40%" className="min-w-0">
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  {projectId ? <EditorArea projectId={projectId} /> : <div className="h-full">{children}</div>}
                </div>
                <TerminalPanel />
              </div>
            </Panel>
          </Group>
        )}
      </div>
      <MobileSidebar />
      <AgentSelectorModal />
      <AddProjectModal />
      <DeleteProjectModal />
      <LogsDrawer />
      <CodexRemoteModal />
      <Toaster />
    </div>
  )
}
