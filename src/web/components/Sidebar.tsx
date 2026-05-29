import { Grid2x2, HelpCircle, Play, Plus, Settings, X, PanelLeft } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { initials, projectHue } from '../lib/format'
import type { Project } from '../../types'

export default function Sidebar() {
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const {
    mobileSidebarOpen, sidebarCollapsed,
    setAddProjectOpen, setAgentSelectorProjectId, setMobileSidebarOpen, toggleSidebar
  } = useUIStore()

  const isActive = (id: string) =>
    sessions.some(s => s.projectId === id && (s.state === 'launching' || s.state === 'running'))

  const rail = (expanded: boolean) => (
    <>
      <div className="flex h-12 shrink-0 items-center gap-1 px-2">
        <button type="button" onClick={toggleSidebar} className="rb-icon-button"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title="Toggle sidebar">
          <PanelLeft size={17} />
        </button>
        {expanded && <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Projects</span>}
      </div>

      <NavLink to="/" end className={({ isActive: a }) =>
        `mx-2 mb-1 flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 transition-colors ${a ? 'bg-[var(--color-bg-overlay)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}
        title="Overview">
        <Grid2x2 size={18} className="shrink-0" />
        {expanded && <span className="truncate text-sm">Overview</span>}
      </NavLink>

      <div className="rb-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {projects.map(p => (
          <ProjectEntry key={p.id} project={p} expanded={expanded} running={isActive(p.id)}
            onLaunch={() => setAgentSelectorProjectId(p.id)}
            onNavigate={() => setMobileSidebarOpen(false)} />
        ))}
        <button type="button" onClick={() => setAddProjectOpen(true)}
          className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label="Add project" title="Add project">
          <Plus size={18} className="shrink-0" />
          {expanded && <span className="truncate text-sm">Add project</span>}
        </button>
      </div>

      <div className="shrink-0 space-y-1 border-t border-[var(--color-border-subtle)] p-2">
        <Link to="/settings" className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]" title="Settings">
          <Settings size={18} className="shrink-0" />{expanded && <span className="text-sm">Settings</span>}
        </Link>
        <a href="https://github.com/sowndev/remotebridge" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]" title="Help">
          <HelpCircle size={18} className="shrink-0" />{expanded && <span className="text-sm">Help</span>}
        </a>
      </div>
    </>
  )

  const desktopWidth = sidebarCollapsed ? 'w-14' : 'w-60'

  return (
    <>
      <aside aria-label="Projects" className={`hidden shrink-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] md:flex ${desktopWidth}`}>
        {rail(!sidebarCollapsed)}
      </aside>
      <aside aria-label="Projects" aria-hidden={!mobileSidebarOpen}
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(84vw,320px)] flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl transition-transform duration-200 md:hidden ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Projects</span>
          <button type="button" aria-label="Close project navigation" title="Close" className="rb-icon-button" onClick={() => setMobileSidebarOpen(false)}>
            <X size={17} />
          </button>
        </div>
        {rail(true)}
      </aside>
    </>
  )
}

function ProjectEntry({ project, expanded, running, onLaunch, onNavigate }: {
  project: Project; expanded: boolean; running: boolean; onLaunch: () => void; onNavigate: () => void
}) {
  const hue = projectHue(project.id)
  return (
    <NavLink to={`/project/${project.id}`} onClick={onNavigate}
      title={`${project.name}\n${project.path}`}
      className={({ isActive }) =>
        `group relative flex items-center gap-2 rounded-[var(--radius-md)] border px-1.5 py-1.5 transition-colors ${isActive ? 'border-[var(--color-border-default)] bg-[var(--color-bg-overlay)]' : 'border-transparent hover:bg-[var(--color-bg-hover)]'}`}>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xs font-semibold text-white"
        style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}>
        {initials(project.name)}
        {running && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-bg-surface)] bg-[var(--color-running)]" />}
      </span>
      {expanded && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{project.name}</span>
          <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{project.path}</span>
        </span>
      )}
      {expanded && (
        <button type="button" aria-label={`Launch session in ${project.name}`} title="New session"
          onClick={(e) => { e.preventDefault(); onLaunch() }}
          className="rb-icon-button h-7 min-h-7 min-w-7 shrink-0 text-[var(--color-accent)]">
          <Play size={14} />
        </button>
      )}
    </NavLink>
  )
}
