import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import SessionRow from './SessionRow'
import { compareSessions, dayLabel } from '../lib/format'
import type { Project, Session } from '../../types'

export default function SessionsPanel({ project }: { project: Project }) {
  const { sessions, removeSession } = useSessionsStore()
  const { setAgentSelectorProjectId, addToast } = useUIStore()
  const [clearing, setClearing] = useState(false)

  const groups = useMemo(() => {
    const mine = sessions.filter(s => s.projectId === project.id)
    const byDay = new Map<string, Session[]>()
    for (const s of [...mine].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
      const key = dayLabel(s.startedAt)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(s)
    }
    for (const [, arr] of byDay) arr.sort(compareSessions)
    return [...byDay.entries()]
  }, [sessions, project.id])

  const total = groups.reduce((n, [, arr]) => n + arr.length, 0)
  const running = sessions.filter(s => s.projectId === project.id && (s.state === 'running' || s.state === 'launching')).length
  const clearable = useMemo(
    () => sessions.filter(s => s.projectId === project.id && (s.state === 'stopped' || s.state === 'failed')),
    [sessions, project.id]
  )

  const clearStopped = async () => {
    if (!clearable.length || clearing) return
    if (!window.confirm(`Delete ${clearable.length} stopped session(s)? This cannot be undone.`)) return
    setClearing(true)
    const results = await Promise.allSettled(clearable.map(async s => {
      await api.deleteSession(s.id); removeSession(s.id)
    }))
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed) addToast(`Failed to delete ${failed} session(s)`)
    setClearing(false)
  }

  return (
    <div className="rb-scrollbar h-full overflow-y-auto bg-[var(--color-bg-base)] p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Sessions</h2>
          <div className="flex items-center gap-3">
            {clearable.length > 0 && (
              <button type="button" onClick={clearStopped} disabled={clearing}
                className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-failed)] disabled:opacity-50">
                <Trash2 size={13} /> {clearing ? 'Clearing…' : `Clear stopped (${clearable.length})`}
              </button>
            )}
            <span className="text-xs text-[var(--color-text-muted)]">
              {total} total{running > 0 && <span className="text-[var(--color-running)]"> · {running} running</span>}
            </span>
            <button type="button" onClick={() => setAgentSelectorProjectId(project.id)} className="rb-primary-button gap-1.5 px-3">
              <Plus size={14} /> New session
            </button>
          </div>
        </div>
        {total === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">No sessions yet</p>
            <p className="text-xs text-[var(--color-text-muted)]">Launch one with "New session".</p>
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
      </div>
    </div>
  )
}
