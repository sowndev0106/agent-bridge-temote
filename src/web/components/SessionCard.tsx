import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useProjectsStore } from '../stores/projects'
import { useUIStore } from '../stores/ui'
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'
import type { Session } from '../../types'

const STATE_COLORS = {
  launching: 'text-[var(--color-launching)]',
  running: 'text-[var(--color-running)]',
  stopped: 'text-[var(--color-stopped)]',
  failed: 'text-[var(--color-failed)]'
} as const

const STATE_ICONS = { launching: '◌', running: '●', stopped: '○', failed: '⚠' }

export default function SessionCard({ session }: { session: Session }) {
  const { updateSession, removeSession } = useSessionsStore()
  const { projects } = useProjectsStore()
  const { setLogsSessionId } = useUIStore()

  // Show the project's display name, not its raw UUID. Falls back to the id if the
  // project was deleted (H15 blocks delete for live sessions, but a stopped session's
  // project can be removed).
  const projectName = projects.find(p => p.id === session.projectId)?.name ?? session.projectId

  const stop = async () => {
    const updated = await api.stopSession(session.id)
    updateSession(session.id, updated)
  }

  const restart = async () => {
    const updated = await api.restartSession(session.id)
    updateSession(session.id, updated)
  }

  const remove = async () => {
    await api.deleteSession(session.id)
    removeSession(session.id)
  }

  const openTerminal = () => {
    console.log('[SessionCard] openTerminal clicked for session:', session.id, 'state:', session.state)
    const existing = useTerminalsStore.getState().tabs.find(t => t.sessionId === session.id)
    console.log('[SessionCard] existing terminal tab found:', existing)
    if (existing) {
      console.log('[SessionCard] Switching to existing terminal tab:', existing.id)
      useTerminalsStore.getState().setActiveTab(existing.id)
      useTerminalsStore.getState().setPanelOpen(true)
      return
    }
    console.log('[SessionCard] Sending terminal.attach event to WS for session:', session.id)
    sendWsMessage({ type: 'terminal.attach', payload: { sessionId: session.id } })
    console.log('[SessionCard] Adding session tab to terminals store')
    useTerminalsStore.getState().addTab({
      id: session.id,
      title: `${session.agentId} session`,
      type: 'session',
      sessionId: session.id
    })
  }

  return (
    <article
      data-testid="session-card"
      className={`flex min-w-0 flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] border-l-[3px] bg-[var(--color-bg-surface)] p-3 shadow-[var(--shadow-card)] sm:p-4 ${
        session.state === 'running'
          ? 'border-l-[var(--color-running)]'
          : session.state === 'launching'
            ? 'border-l-[var(--color-launching)]'
            : session.state === 'failed'
              ? 'border-l-[var(--color-failed)]'
              : 'border-l-[var(--color-stopped)]'
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{projectName}</p>
          <p className="rb-mono mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{session.agentId}</p>
        </div>
        <span className={`rb-mono shrink-0 whitespace-nowrap text-[11px] ${STATE_COLORS[session.state]}`}>
          {STATE_ICONS[session.state]} {session.state.charAt(0).toUpperCase() + session.state.slice(1)}
        </span>
      </div>

      {session.state === 'launching' && (
        <div className="overflow-hidden rounded-full bg-[var(--color-bg-overlay)]">
          <div className="h-1.5 w-1/2 rounded-full bg-[var(--color-launching)]" style={{ animation: 'rb-shimmer 1.4s ease-in-out infinite' }} />
        </div>
      )}

      {session.state === 'running' && session.remoteLink && (
        <a
          href={session.remoteLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rb-primary-button w-full px-3"
        >
          <span className="truncate">Open Remote Control</span>
          <span aria-hidden="true">↗</span>
        </a>
      )}

      {session.state === 'failed' && (
        <p className="min-w-0 break-words text-xs text-[var(--color-failed)]">{session.error ?? 'Unknown error'}</p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {session.state === 'running' && (
          <button type="button" onClick={stop} className="rb-ghost-button px-3 text-[var(--color-text-secondary)] sm:flex-1">
            Stop
          </button>
        )}
        {(session.state === 'stopped' || session.state === 'failed') && (
          <>
            <button type="button" onClick={restart} className="rb-ghost-button px-3 sm:flex-1">
              Restart
            </button>
            <button type="button" onClick={remove} className="rb-ghost-button px-3 text-[var(--color-failed)]">
              Delete
            </button>
          </>
        )}
        {(session.state === 'launching' || session.state === 'running') && (
          <button
            type="button"
            onClick={openTerminal}
            className="rb-ghost-button px-3 text-[var(--color-accent)]"
            title="Open interactive terminal"
            aria-label={`Open terminal for ${session.agentId} session ${session.id}`}
          >
            Term
          </button>
        )}
        <button
          type="button"
          onClick={() => setLogsSessionId(session.id)}
          className="rb-ghost-button px-3"
          aria-label={`View logs for ${session.agentId} session ${session.id}`}
        >
          Logs
        </button>
      </div>
    </article>
  )
}
