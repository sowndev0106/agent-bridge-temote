import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Plus, Settings, HelpCircle } from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { initials, projectColor } from '../lib/format'

export default function ActivityBar() {
  const { projects } = useProjectsStore()
  const { sessions } = useSessionsStore()
  const setAddProjectOpen = useUIStore(s => s.setAddProjectOpen)
  const [tip, setTip] = useState<{ label: string; y: number } | null>(null)

  const running = (id: string) =>
    sessions.some(s => s.projectId === id && (s.state === 'launching' || s.state === 'running'))
  const show = (label: string, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTip({ label, y: r.top + r.height / 2 })
  }

  return (
    <aside aria-label="Projects" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] py-2">
      <div className="rb-scrollbar flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {projects.map(p => (
          <NavLink key={p.id} to={`/project/${p.id}`} title={`${p.name}\n${p.path}`}
            onMouseEnter={e => show(p.name, e)} onMouseLeave={() => setTip(null)}
            className={({ isActive }) =>
              `relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-xs font-semibold text-white transition-all ${isActive ? 'ring-2 ring-[var(--color-accent)]' : 'opacity-80 hover:opacity-100'}`}
            style={{ backgroundColor: projectColor(p.id) }}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-2 h-5 w-0.5 rounded-r bg-[var(--color-accent)]" />}
                {initials(p.name)}
                {running(p.id) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-bg-surface)] bg-[var(--color-running)]" style={{ animation: 'rb-pulse 3s ease-in-out infinite' }} />}
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={() => setAddProjectOpen(true)} aria-label="Add project" title="Add project"
          onMouseEnter={e => show('Add project', e)} onMouseLeave={() => setTip(null)}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]">
          <Plus size={18} />
        </button>
      </div>
      <div className="flex flex-col items-center gap-1 border-t border-[var(--color-border-subtle)] pt-2">
        <Link to="/settings" title="Settings" onMouseEnter={e => show('Settings', e)} onMouseLeave={() => setTip(null)}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
          <Settings size={18} />
        </Link>
        <a href="https://github.com/sowndev/remotebridge" target="_blank" rel="noopener noreferrer" title="Help"
          onMouseEnter={e => show('Help', e)} onMouseLeave={() => setTip(null)}
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
          <HelpCircle size={18} />
        </a>
      </div>
      {tip && (
        <span className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-2 py-1 text-xs text-[var(--color-text-primary)] shadow-[var(--shadow-modal)]"
          style={{ left: 52, top: tip.y }}>{tip.label}</span>
      )}
    </aside>
  )
}
