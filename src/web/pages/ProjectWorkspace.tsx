import { useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Plus, TerminalSquare, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { sendWsMessage } from '../lib/ws'
import SessionRow from '../components/SessionRow'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'
import FileExplorerPanel from '../components/FileExplorerPanel'
import { compareSessions, projectColor, initials, dayLabel } from '../lib/format'
import type { Session } from '../../types'

export default function ProjectWorkspace() {
  const { projectId } = useParams()
  const { projects } = useProjectsStore()
  const { sessions, removeSession } = useSessionsStore()
  const { setAgentSelectorProjectId } = useUIStore()
  const [clearing, setClearing] = useState(false)

  const project = projects.find(p => p.id === projectId)

  const groups = useMemo(() => {
    const mine = sessions.filter(s => s.projectId === projectId)
    const byDay = new Map<string, Session[]>()
    for (const s of [...mine].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
      const key = dayLabel(s.startedAt)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(s)
    }
    for (const [, arr] of byDay) arr.sort(compareSessions)
    return [...byDay.entries()]
  }, [sessions, projectId])

  const total = groups.reduce((n, [, arr]) => n + arr.length, 0)
  const running = sessions.filter(s => s.projectId === projectId && (s.state === 'running' || s.state === 'launching')).length
  const clearable = useMemo(
    () => sessions.filter(s => s.projectId === projectId && (s.state === 'stopped' || s.state === 'failed')),
    [sessions, projectId]
  )

  if (!project) {
    return projects.length === 0
      ? <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
      : <Navigate to="/" replace />
  }

  const openShell = () => sendWsMessage({ type: 'terminal.create', payload: { cwd: project.path, projectId: project.id } })

  const clearStopped = async () => {
    if (clearable.length === 0 || clearing) return
    if (!window.confirm(`Delete ${clearable.length} stopped session${clearable.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    setClearing(true)
    // Fire all deletes in parallel; remove each from the store only when its
    // request succeeds, so a partial failure leaves the still-present ones in view.
    await Promise.allSettled(clearable.map(async s => {
      await api.deleteSession(s.id)
      removeSession(s.id)
    }))
    setClearing(false)
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 py-2">
        <header className="flex min-w-0 flex-wrap items-center gap-4 border-b border-[var(--color-border-subtle)] pb-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-base font-semibold text-white shadow-sm" style={{ backgroundColor: projectColor(project.id) }}>
            {initials(project.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">{project.name}</h1>
            <p className="rb-mono mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{project.path}</p>
          </div>
          <button type="button" onClick={() => setAgentSelectorProjectId(project.id)} className="rb-primary-button gap-1.5 px-4">
            <Plus size={15} /> New session
          </button>
        </header>

        <FileExplorerPanel project={project} />

        <section className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Sessions</h2>
            <div className="flex items-center gap-3">
              {clearable.length > 0 && (
                <button type="button" onClick={clearStopped} disabled={clearing}
                  className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-failed)] disabled:cursor-not-allowed disabled:opacity-50"
                  title={`Delete ${clearable.length} stopped/failed session${clearable.length === 1 ? '' : 's'}`}>
                  <Trash2 size={13} /> {clearing ? 'Clearing…' : `Clear stopped (${clearable.length})`}
                </button>
              )}
              <span className="text-xs text-[var(--color-text-muted)]">
                {total} total{running > 0 && <span className="text-[var(--color-running)]"> · {running} running</span>}
              </span>
            </div>
          </div>

          {total === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">No sessions yet</p>
              <p className="text-xs text-[var(--color-text-muted)]">Launch one with the “New session” button.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-7">
              {groups.map(([day, items]) => (
                <div key={day} className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 px-1">
                    <span className="shrink-0 text-xs font-medium text-[var(--color-text-secondary)]">{day}</span>
                    <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">{items.length}</span>
                  </div>
                  <div className="divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/40">
                    {items.map(s => <SessionRow key={s.id} session={s} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Terminals</h2>
            <button type="button" onClick={openShell} className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]" title="Open a shell in this project">
              <TerminalSquare size={14} /> New shell
            </button>
          </div>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
            Shells and agent terminals for this project appear in the panel at the bottom.
          </p>
        </section>
      </div>

      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
