import { ExternalLink, RotateCw, ScrollText, Square, SquareTerminal, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'
import { shortId, formatDuration, formatClock } from '../lib/format'
import type { Session } from '../../types'

const DOT = {
  launching: 'text-[var(--color-launching)]',
  running: 'text-[var(--color-running)]',
  stopped: 'text-[var(--color-stopped)]',
  failed: 'text-[var(--color-failed)]'
} as const
const ICON = { launching: '◌', running: '●', stopped: '○', failed: '⚠' }
const BORDER = {
  running: 'border-l-[var(--color-running)]',
  launching: 'border-l-[var(--color-launching)]',
  failed: 'border-l-[var(--color-failed)]',
  stopped: 'border-l-[var(--color-stopped)]'
} as const

function meta(s: Session): string {
  const time = s.state === 'running' || s.state === 'launching'
    ? `running ${formatDuration(s.startedAt)}`
    : `${formatClock(s.startedAt)}${s.stoppedAt ? ` · ran ${formatDuration(s.startedAt, s.stoppedAt)}` : ''}`
  return s.pid ? `${time} · pid ${s.pid}` : time
}

const ACTION = 'rb-icon-button h-8 min-h-8 w-8 min-w-8'

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
      className={`group flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] border-l-[3px] bg-[var(--color-bg-surface)] px-3 py-2 transition-colors hover:bg-[var(--color-bg-hover)] ${BORDER[session.state]}`}
    >
      <span
        className={`shrink-0 text-[11px] ${DOT[session.state]}`}
        aria-hidden="true"
        title={session.state}
        style={session.state === 'running' ? { animation: 'rb-pulse 3s ease-in-out infinite' } : undefined}
      >
        {ICON[session.state]}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="rb-mono font-medium text-[var(--color-text-primary)]">{shortId(session.id)}</span>
          <span className="text-[var(--color-text-muted)]"> · {session.agentId}</span>
        </p>
        <p className={`truncate text-[11px] ${session.state === 'failed' ? 'text-[var(--color-failed)]' : 'text-[var(--color-text-muted)]'}`}>
          {session.state === 'failed' ? (session.error ?? 'Unknown error') : meta(session)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {session.state === 'running' && session.remoteLink && (
          <a href={session.remoteLink} target="_blank" rel="noopener noreferrer"
            className={`${ACTION} border-[var(--color-accent)] text-[var(--color-accent)]`}
            title="Open remote control" aria-label="Open remote control">
            <ExternalLink size={15} />
          </a>
        )}
        {session.state === 'running' && (
          <button type="button" onClick={stop} className={ACTION} title="Stop" aria-label="Stop session">
            <Square size={14} />
          </button>
        )}
        {(session.state === 'stopped' || session.state === 'failed') && (
          <button type="button" onClick={restart} className={ACTION} title="Restart" aria-label="Restart session">
            <RotateCw size={14} />
          </button>
        )}
        {live && (
          <button type="button" onClick={openTerminal} className={`${ACTION} text-[var(--color-accent)]`} title="Open terminal" aria-label="Open terminal">
            <SquareTerminal size={15} />
          </button>
        )}
        <button type="button" onClick={() => setLogsSessionId(session.id)} className={ACTION} title="Logs" aria-label="View logs">
          <ScrollText size={15} />
        </button>
        {(session.state === 'stopped' || session.state === 'failed') && (
          <button type="button" onClick={remove} className={`${ACTION} text-[var(--color-failed)]`} title="Delete" aria-label="Delete session">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </article>
  )
}
