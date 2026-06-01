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

export default function SessionRow({ session }: { session: Session }) {
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

  return (
    <article
      data-testid="session-row"
      className="group flex items-center gap-4 px-4 py-3.5 transition-colors first:rounded-t-[var(--radius-lg)] last:rounded-b-[var(--radius-lg)] hover:bg-[var(--color-bg-hover)]"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center" title={session.state} aria-hidden="true">
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

      <div className="flex shrink-0 items-center gap-0.5">
        {session.state === 'running' && (
          <button type="button" onClick={stop} className={ACT} title="Stop" aria-label="Stop session">
            <Square size={15} />
          </button>
        )}
        {(session.state === 'stopped' || session.state === 'failed') && (
          <button type="button" onClick={restart} className={ACT} title="Restart" aria-label="Restart session">
            <Play size={15} />
          </button>
        )}
        {live && (
          <button type="button" onClick={openTerminal} className={`${ACT} hover:text-[var(--color-accent)]`} title="Open terminal" aria-label="Open terminal">
            <SquareTerminal size={16} />
          </button>
        )}
        <button type="button" onClick={() => setLogsSessionId(session.id)} className={ACT} title="Logs" aria-label="View logs">
          <ScrollText size={16} />
        </button>
        {(session.state === 'stopped' || session.state === 'failed') && (
          <button type="button" onClick={remove} className={`${ACT} hover:text-[var(--color-failed)]`} title="Delete" aria-label="Delete session">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </article>
  )
}
