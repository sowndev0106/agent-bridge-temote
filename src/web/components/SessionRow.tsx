import { ExternalLink, Play, ScrollText, Square, SquareTerminal, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'
import { shortId, formatDuration, formatClock } from '../lib/format'
import type { Session } from '../../types'

const DOT_BG = {
  launching: 'bg-[var(--color-launching)]',
  running: 'bg-[var(--color-running)]',
  stopped: 'bg-[var(--color-stopped)]',
  failed: 'bg-[var(--color-failed)]'
} as const

function meta(s: Session): string {
  const time = s.state === 'running' || s.state === 'launching'
    ? `running ${formatDuration(s.startedAt)}`
    : `${formatClock(s.startedAt)}${s.stoppedAt ? ` · ran ${formatDuration(s.startedAt, s.stoppedAt)}` : ''}`
  const parts = [time]
  if (s.branch) parts.push(s.branch)
  if (s.pid) parts.push(`pid ${s.pid}`)
  return parts.join(' · ')
}

const ACT = 'flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-overlay)] hover:text-[var(--color-text-primary)]'

export default function SessionRow({ session, compact = false }: { session: Session; compact?: boolean }) {
  const { updateSession, removeSession } = useSessionsStore()
  const { setLogsSessionId, addToast } = useUIStore()
  const live = session.state === 'running' || session.state === 'launching'

  const stop = async () => {
    try { updateSession(session.id, await api.stopSession(session.id)) }
    catch (e) { addToast((e as Error).message) }
  }
  const restart = async () => {
    try { updateSession(session.id, await api.restartSession(session.id)) }
    catch (e) { addToast((e as Error).message) }
  }
  const remove = async () => {
    try { await api.deleteSession(session.id); removeSession(session.id) }
    catch (e) { addToast((e as Error).message) }
  }

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

  const actClass = compact
    ? 'flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-overlay)] hover:text-[var(--color-text-primary)]'
    : ACT
  const iconSize = (normalSize: number) => compact ? normalSize - 2 : normalSize

  return (
    <article
      data-testid="session-row"
      className={`group flex items-start transition-colors first:rounded-t-[var(--radius-lg)] last:rounded-b-[var(--radius-lg)] hover:bg-[var(--color-bg-hover)] ${
        compact ? 'gap-2.5 pl-[22px] pr-2 py-2' : 'gap-4 px-4 py-3.5'
      }`}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center mt-[5px]" title={session.state} aria-hidden="true">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT_BG[session.state]}`} />
        {session.state === 'running' && (
          <span className={`absolute h-2.5 w-2.5 rounded-full ${DOT_BG.running}`} style={{ animation: 'rb-ping 1.8s cubic-bezier(0,0,0.2,1) infinite' }} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {session.title ? (
          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{session.title}</p>
        ) : (
          <p className="truncate text-sm">
            <span className="rb-mono font-semibold text-[var(--color-text-primary)]">{shortId(session.id)}</span>
            <span className="text-[var(--color-text-secondary)]">  {session.agentId}</span>
          </p>
        )}
        <p className={`mt-1 truncate text-xs ${session.state === 'failed' ? 'text-[var(--color-failed)]' : 'text-[var(--color-text-muted)]'}`}>
          {session.state === 'failed'
            ? (session.error ?? 'Unknown error')
            : (session.title
                ? `${shortId(session.id)} · ${session.agentId} · ${meta(session)}`
                : meta(session))}
        </p>
      </div>

      {session.state === 'running' && session.remoteLink && (
        <a href={session.remoteLink} target="_blank" rel="noopener noreferrer"
          className="hidden shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-glow)] sm:inline-flex"
          title="Open remote control">
          Open Remote <ExternalLink size={13} />
        </a>
      )}

      <div className={`flex shrink-0 items-center ${compact ? 'gap-0 opacity-0 group-hover:opacity-100 transition-opacity mt-[3px]' : 'gap-0.5 mt-[4px]'}`}>
        {session.state === 'running' && (
          <button type="button" onClick={stop} className={actClass} title="Stop" aria-label="Stop session">
            <Square size={iconSize(15)} />
          </button>
        )}
        {(session.state === 'stopped' || session.state === 'failed') && (
          <button type="button" onClick={restart} className={actClass} title="Restart" aria-label="Restart session">
            <Play size={iconSize(15)} />
          </button>
        )}
        {live && (
          <button type="button" onClick={openTerminal} className={`${actClass} hover:text-[var(--color-accent)]`} title="Open terminal" aria-label="Open terminal">
            <SquareTerminal size={iconSize(16)} />
          </button>
        )}
        <button type="button" onClick={() => setLogsSessionId(session.id)} className={actClass} title="Logs" aria-label="View logs">
          <ScrollText size={iconSize(16)} />
        </button>
        {(session.state === 'stopped' || session.state === 'failed') && (
          <button type="button" onClick={remove} className={`${actClass} hover:text-[var(--color-failed)]`} title="Delete" aria-label="Delete session">
            <Trash2 size={iconSize(15)} />
          </button>
        )}
      </div>
    </article>
  )
}
