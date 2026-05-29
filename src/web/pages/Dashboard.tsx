import { useSessionsStore } from '../stores/sessions'
import SessionCard from '../components/SessionCard'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'

export default function Dashboard() {
  const { sessions } = useSessionsStore()
  return (
    <>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Active Sessions</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              {sessions.length === 0 ? 'No sessions running' : `${sessions.length} tracked session${sessions.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <span className="rounded-[var(--radius-sm)] border border-[var(--color-border-default)] px-2 py-1 font-mono text-xs text-[var(--color-text-code)]">
            {sessions.length}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-6 text-center">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">No active sessions</p>
              <p className="mt-1 max-w-xs text-xs text-[var(--color-text-muted)]">Open the project navigation and launch Claude Code from a saved project.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        )}
      </div>

      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
