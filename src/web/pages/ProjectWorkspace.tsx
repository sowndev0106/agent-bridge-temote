import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { sendWsMessage } from '../lib/ws'
import SessionRow from '../components/SessionRow'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'
import { compareSessions, projectColor, initials, dayLabel } from '../lib/format'
import type { Session } from '../../types'

export default function ProjectWorkspace() {
  const { projectId } = useParams()
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const { setAgentSelectorProjectId } = useUIStore()

  const project = projects.find(p => p.id === projectId)

  // Group this project's sessions by day (most recent day first); within a day,
  // sort by state (running first) then recency.
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

  if (!project) {
    return projects.length === 0
      ? <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
      : <Navigate to="/" replace />
  }

  const openShell = () => sendWsMessage({ type: 'terminal.create', payload: { cwd: project.path, projectId: project.id } })

  return (
    <>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: projectColor(project.id) }}>
            {initials(project.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-[var(--color-text-primary)]">{project.name}</h1>
            <p className="rb-mono truncate text-xs text-[var(--color-text-muted)]">{project.path}</p>
          </div>
          <button type="button" onClick={() => setAgentSelectorProjectId(project.id)} className="rb-primary-button px-3">
            + New session
          </button>
        </header>

        <section className="flex flex-col gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            Sessions ({total})
          </p>
          {total === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] text-center text-xs text-[var(--color-text-muted)]">
              No sessions yet. Launch one with the “+ New session” button.
            </div>
          ) : (
            groups.map(([day, items]) => (
              <div key={day} className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 text-[11px] font-medium text-[var(--color-text-secondary)]">{day}</span>
                  <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
                  <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{items.length}</span>
                </div>
                {items.map(s => <SessionRow key={s.id} session={s} />)}
              </div>
            ))
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Terminals</p>
            <button type="button" onClick={openShell} className="rb-ghost-button px-3" title="Open a shell in this project">
              <span aria-hidden="true">$</span> Shell
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Shells and agent terminals for this project appear in the panel below.
          </p>
        </section>
      </div>

      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
