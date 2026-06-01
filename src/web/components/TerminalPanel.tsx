import { useRef, useCallback } from 'react'
import { useMatch } from 'react-router-dom'
import { useTerminalsStore, type TerminalTabInfo } from '../stores/terminals'
import { useSessionsStore } from '../stores/sessions'
import { useProjectsStore } from '../stores/projects'
import TerminalTab from './TerminalTab'
import CodexChatPanel from './CodexChatPanel'
import { sendWsMessage } from '../lib/ws'

export default function TerminalPanel() {
  const { tabs, activeTabId, panelOpen, panelHeight, removeTab, setActiveTab, togglePanel, setPanelHeight } = useTerminalsStore()
  const sessions = useSessionsStore(s => s.sessions)
  const match = useMatch('/project/:projectId')
  const activeProjectId = match?.params.projectId ?? null
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const tabProjectId = (t: TerminalTabInfo): string | null =>
    t.type === 'session'
      ? (sessions.find(s => s.id === t.sessionId)?.projectId ?? t.projectId ?? null)
      : (t.projectId ?? null)

  // Tab strip is filtered to the active project; on non-workspace routes show all.
  const visibleTabs = activeProjectId
    ? tabs.filter(t => tabProjectId(t) === activeProjectId)
    : tabs

  // The active tab must be one of the visible tabs, else fall back to the first visible.
  const effectiveActiveId = visibleTabs.some(t => t.id === activeTabId)
    ? activeTabId
    : (visibleTabs[0]?.id ?? null)

  const handleNewTerminal = () => {
    const project = useProjectsStore.getState().projects.find(p => p.id === activeProjectId)
    sendWsMessage({ type: 'terminal.create', payload: { cwd: project?.path, projectId: activeProjectId } })
  }

  const handleCloseTab = (id: string, type: TerminalTabInfo['type']) => {
    if (type === 'standalone') {
      sendWsMessage({ type: 'terminal.close', payload: { terminalId: id } })
    }
    removeTab(id)
  }

  // Drag-to-resize
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: panelHeight }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      const vh = window.innerHeight
      const newHeight = dragRef.current.startHeight + (delta / vh) * 100
      setPanelHeight(newHeight)
    }

    const handleUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [panelHeight, setPanelHeight])

  if (!panelOpen || visibleTabs.length === 0) {
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
  }

  return (
    <div
      className="flex shrink-0 flex-col border-t border-[var(--color-border-default)] bg-[var(--color-bg-base)]"
      style={{ height: `clamp(220px, ${panelHeight}vh, 70dvh)` }}
    >
      {/* Drag handle */}
      <div
        className="h-1 flex-shrink-0 cursor-row-resize bg-[var(--color-bg-overlay)] transition-colors hover:bg-[var(--color-accent)]/50"
        onMouseDown={handleDragStart}
      />

      {/* Tab bar (filtered to active project) */}
      <div className="flex items-center border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/80 px-1">
        <div className="rb-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {visibleTabs.map(tab => (
            <div
              key={tab.id}
              className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs transition-colors ${
                effectiveActiveId === tab.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-bg-overlay)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="max-w-[120px] truncate font-mono">
                {tab.type === 'session' ? `⚡ ${tab.title}` : `$ ${tab.title}`}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id, tab.type) }}
                className="ml-1 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:text-[var(--color-text-primary)] group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>

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
      </div>

      {/* Terminal content — ALL tabs stay mounted (hidden via isActive) to preserve
          xterm state when switching projects; only the active visible one is shown. */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => {
          const session = tab.sessionId ? sessions.find(s => s.id === tab.sessionId) : null
          const isCodex = session?.agentId === 'codex'

          if (isCodex) {
            return (
              <div
                key={tab.id}
                className="h-full w-full"
                style={{ display: tab.id === effectiveActiveId ? 'block' : 'none' }}
              >
                <CodexChatPanel sessionId={tab.sessionId!} />
              </div>
            )
          }

          return (
            <TerminalTab
              key={tab.id}
              terminalId={tab.id}
              isActive={tab.id === effectiveActiveId}
            />
          )
        })}
      </div>
    </div>
  )
}
