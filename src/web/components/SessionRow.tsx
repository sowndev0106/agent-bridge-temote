import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'
import { shortId, formatDuration, formatClock } from '../lib/format'
import type { Session } from '../../types'

const STATE_COLORS = {
  launching: 'text-[var(--color-launching)]',
  running: 'text-[var(--color-running)]',
  stopped: 'text-[var(--color-stopped)]',
  failed: 'text-[var(--color-failed)]'
} as const
const STATE_ICONS = { launching: '◌', running: '●', stopped: '○', failed: '⚠' }
const BORDER = {
  running: 'border-l-[var(--color-running)]',
  launching: 'border-l-[var(--color-launching)]',
  failed: 'border-l-[var(--color-failed)]',
  stopped: 'border-l-[var(--color-stopped)]'
} as const

function timeLabel(s: Session): string {
  if (s.state === 'running' || s.state === 'launching') return `running ${formatDuration(s.startedAt)}`
  const dur = s.stoppedAt ? ` · ran ${formatDuration(s.startedAt, s.stoppedAt)}` : ''
  return `${formatClock(s.startedAt)}${dur}`
}

export default function SessionRow({ session }: { session: Session }) {
  const { updateSession, removeSession } = useSessionsStore()
  const { setLogsSessionId } = useUIStore()
  const live = session.state === 'running' || session.state === 'launching'

  const stop = async () => updateSession(session.id, await api.stopSession(session.id))
  const restart = async () => updateSession(session.id, await api.restartSession(session.id))
  const remove = async () => { await api.deleteSession(session.id); removeSession(session.id) }

  const openTerminal = () => {
    const existing = useTerminalsStore.getState().tabs.find(t => t.sessionId === session.id)
    if (existing) {
      useTerminalsStore.getState().setActiveTab(existing.id)
      useTerminalsStore.getState().setPanelOpen(true)
      return
    }
    sendWsMessage({ type: 'terminal.attach', payload: { sessionId: session.id } })
    useTerminalsStore.getState().addTab({
      id: session.id,
      title: `${session.agentId} ${shortId(session.id)}`,
      type: 'session',
      sessionId: session.id,
      projectId: session.projectId
    })
  }

  return (
    <article
      data-testid="session-row"
      className={`group flex min-w-0 flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] border-l-[3px] bg-[var(--color-bg-surface)] p-3 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] sm:flex-row sm:items-center sm:gap-3 ${BORDER[session.state]}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`shrink-0 text-[13px] ${STATE_COLORS[session.state]}`}
          aria-hidden="true"
          style={session.state === 'running' ? { animation: 'rb-pulse 3s ease-in-out infinite' } : undefined}
        >
          {STATE_ICONS[session.state]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--color-text-primary)]">
            <span className="rb-mono font-medium">{shortId(session.id)}</span>
            <span className="text-[var(--color-text-muted)]"> · {session.agentId}</span>
          </p>
          <p className="truncate text-[11px] text-[var(--color-text-muted)]">{timeLabel(session)}</p>
        </div>
      </div>

      {session.state === 'failed' && (
        <p className="min-w-0 break-words text-xs text-[var(--color-failed)] sm:max-w-[40%]">{session.error ?? 'Unknown error'}</p>
      )}

      {session.state === 'running' && session.remoteLink && (
        <a href={session.remoteLink} target="_blank" rel="noopener noreferrer" className="rb-primary-button shrink-0 px-3">
          <span className="truncate">Open Remote</span><span aria-hidden="true">↗</span>
        </a>
      )}

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {session.state === 'running' && (
          <button type="button" onClick={stop} className="rb-ghost-button px-3">Stop</button>
        )}
        {(session.state === 'stopped' || session.state === 'failed') && (
          <>
            <button type="button" onClick={restart} className="rb-ghost-button px-3">Restart</button>
            <button type="button" onClick={remove} className="rb-ghost-button px-3 text-[var(--color-failed)]">Delete</button>
          </>
        )}
        {live && (
          <button type="button" onClick={openTerminal} className="rb-ghost-button px-3 text-[var(--color-accent)]"
            title="Open interactive terminal" aria-label={`Open terminal for session ${session.id}`}>
            Term
          </button>
        )}
        <button type="button" onClick={() => setLogsSessionId(session.id)} className="rb-ghost-button px-3"
          aria-label={`View logs for session ${session.id}`}>
          Logs
        </button>
      </div>
    </article>
  )
}
