import { Play, Plus, X } from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'

export default function Sidebar() {
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const { mobileSidebarOpen, setAddProjectOpen, setAgentSelectorProjectId, setMobileSidebarOpen } = useUIStore()

  const renderContent = () => (
    <>
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-3 lg:px-4">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)] md:hidden lg:block">
          Projects
        </p>
        <button
          type="button"
          aria-label="Add project"
          title="Add project"
          onClick={() => setAddProjectOpen(true)}
          className="rb-icon-button ml-auto h-8 min-h-8 min-w-8"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="rb-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {projects.map(p => (
          <ProjectButton
            key={p.id}
            name={p.name}
            path={p.path}
            active={sessions.some(s => s.projectId === p.id && (s.state === 'launching' || s.state === 'running'))}
            onClick={() => setAgentSelectorProjectId(p.id)}
          />
        ))}
      </div>
    </>
  )

  return (
    <>
      <aside
        aria-label="Projects"
        className="rb-scrollbar hidden w-14 shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] md:flex lg:w-60"
      >
        {renderContent()}
      </aside>
      <aside
        aria-label="Projects"
        aria-hidden={!mobileSidebarOpen}
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(84vw,320px)] flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl transition-transform duration-200 md:hidden ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Projects</span>
          <button
            type="button"
            aria-label="Close project navigation"
            title="Close"
            className="rb-icon-button"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <X size={17} />
          </button>
        </div>
        {renderContent()}
      </aside>
    </>
  )
}

interface ProjectButtonProps {
  name: string
  path: string
  active: boolean
  onClick: () => void
}

function ProjectButton({ name, path, active, onClick }: ProjectButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${name}\n${path}`}
      className={`group grid w-full min-w-0 grid-cols-[1fr_auto] gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors lg:px-3 ${
        active
          ? 'border-l-[3px] border-l-[var(--color-running)] border-y-[var(--color-border-subtle)] border-r-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)]'
          : 'border-transparent hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)]'
      }`}
    >
      <span className="min-w-0 md:hidden lg:block">
        <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{name}</span>
        <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{path}</span>
      </span>
      <span className="hidden h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-overlay)] text-xs font-semibold text-[var(--color-text-code)] md:flex lg:hidden">
        {name.slice(0, 2).toUpperCase()}
      </span>
      <Play size={14} className="mt-0.5 shrink-0 text-[var(--color-accent)] md:hidden lg:block" />
    </button>
  )
}
