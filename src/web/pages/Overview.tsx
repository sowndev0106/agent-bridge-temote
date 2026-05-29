import { FolderOpen } from 'lucide-react'
import { useConfigStore } from '../stores/config'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import ProjectCard from '../components/ProjectCard'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'

export default function Overview() {
  const { config, wsConnected } = useConfigStore()
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const { setAddProjectOpen } = useUIStore()

  const sorted = projects.slice().sort((a, b) => {
    const la = sessions.filter(s => s.projectId === a.id).reduce((m, s) => Math.max(m, Date.parse(s.startedAt)), Date.parse(a.createdAt))
    const lb = sessions.filter(s => s.projectId === b.id).reduce((m, s) => Math.max(m, Date.parse(s.startedAt)), Date.parse(b.createdAt))
    return lb - la
  })

  return (
    <>
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-10 py-8">
        <div className="flex flex-col items-center gap-3 pt-6">
          <h1 className="rb-mono text-4xl font-bold tracking-tight text-[var(--color-text-secondary)] sm:text-5xl">RemoteBridge</h1>
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-[var(--color-running)]' : 'bg-[var(--color-stopped)]'}`} />
            {config?.host ?? '127.0.0.1'}:{config?.port ?? ''}
          </span>
        </div>

        <div className="w-full">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent projects</h2>
            <button type="button" onClick={() => setAddProjectOpen(true)} className="rb-ghost-button px-3">
              <FolderOpen size={14} /> Open project
            </button>
          </div>
          {sorted.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] text-center text-xs text-[var(--color-text-muted)]">
              No projects yet. Click "Open project" to add one.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map(p => <ProjectCard key={p.id} project={p} sessions={sessions} />)}
            </div>
          )}
        </div>
      </div>

      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
