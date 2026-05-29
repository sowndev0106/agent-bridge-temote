import { useRef, useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { useSessionsStore } from '../stores/sessions'
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'

export default function LogsDrawer() {
  const { logsSessionId, setLogsSessionId } = useUIStore()
  const { sessions } = useSessionsStore()
  const { addTab, tabs } = useTerminalsStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const session = sessions.find(s => s.id === logsSessionId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.logs.length])

  const openInTerminal = () => {
    console.log('[LogsDrawer] openInTerminal clicked, session:', session?.id)
    if (!session) {
      console.warn('[LogsDrawer] No active session found in drawer')
      return
    }
    // Check if already attached
    const existing = tabs.find(t => t.sessionId === session.id)
    console.log('[LogsDrawer] existing terminal tab found:', existing)
    if (existing) {
      console.log('[LogsDrawer] Switching to existing terminal tab:', existing.id)
      useTerminalsStore.getState().setActiveTab(existing.id)
      useTerminalsStore.getState().setPanelOpen(true)
      setLogsSessionId(null)
      return
    }
    // Attach to session PTY
    console.log('[LogsDrawer] Sending terminal.attach event to WS for session:', session.id)
    sendWsMessage({ type: 'terminal.attach', payload: { sessionId: session.id } })
    console.log('[LogsDrawer] Adding session tab to terminals store')
    addTab({
      id: session.id,
      title: `${session.agentId} session`,
      type: 'session',
      sessionId: session.id
    })
    setLogsSessionId(null)  // close drawer
  }

  if (!logsSessionId) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setLogsSessionId(null)}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Logs - ${session?.agentId ?? logsSessionId}`}
        className="flex h-full w-full max-w-full flex-col border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl sm:max-w-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-3 py-3 sm:px-4">
          <h2 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]">
            Logs - {session?.agentId ?? logsSessionId}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {session && (session.state === 'launching' || session.state === 'running') && (
              <button
                type="button"
                onClick={openInTerminal}
                className="rb-ghost-button px-2 text-[var(--color-accent)] sm:px-3"
              >
                <span className="hidden sm:inline">Open Terminal</span>
                <span className="sm:hidden">Term</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLogsSessionId(null)}
              className="rb-icon-button"
              aria-label="Close logs"
              title="Close logs"
            >
              x
            </button>
          </div>
        </div>
        <div className="rb-scrollbar rb-safe-bottom min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-5 text-[var(--color-text-code)] sm:p-4 sm:text-xs">
          {session?.logs.map((line, i) => (
            <p key={i} className={`min-w-0 break-words ${line.match(/https?:\/\//) ? 'font-semibold text-[var(--color-accent)]' : ''}`}>
              {line}
            </p>
          ))}
          <div ref={bottomRef} />
        </div>
      </section>
    </div>
  )
}
