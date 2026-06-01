import { useEffect, useMemo, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { GripVertical, PanelLeftClose, PanelLeftOpen, Plus, Settings, HelpCircle, Trash2 } from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'
import { initials, projectColor } from '../lib/format'

export default function ActivityBar() {
  const projects = useProjectsStore(s => s.projects)
  const liveProjectIds = useSessionsStore(s =>
    s.sessions
      .filter(session => session.state === 'launching' || session.state === 'running')
      .map(session => session.projectId)
      .join('\0')
  )
  const projectSidebarExpanded = useUIStore(s => s.projectSidebarExpanded)
  const projectOrder = useUIStore(s => s.projectOrder)
  const setAddProjectOpen = useUIStore(s => s.setAddProjectOpen)
  const setDeleteProjectId = useUIStore(s => s.setDeleteProjectId)
  const setProjectOrder = useUIStore(s => s.setProjectOrder)
  const toggleProjectSidebarExpanded = useUIStore(s => s.toggleProjectSidebarExpanded)
  const [tip, setTip] = useState<{ label: string; sub?: string; y: number } | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const running = (id: string) => liveProjectIds.split('\0').includes(id)
  const show = (label: string, e: React.MouseEvent, sub?: string) => {
    if (projectSidebarExpanded) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTip({ label, sub, y: r.top + r.height / 2 })
  }

  const reorder = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const order = [...normalizedOrder]
    const from = order.indexOf(sourceId)
    const to = order.indexOf(targetId)
    if (from === -1 || to === -1) return
    order.splice(from, 1)
    order.splice(to, 0, sourceId)
    setProjectOrder(order)
  }
  const knownIds = useMemo(() => projects.map(p => p.id), [projects])
  const normalizedOrder = useMemo(() => [
    ...projectOrder.filter(id => knownIds.includes(id)),
    ...knownIds.filter(id => !projectOrder.includes(id))
  ], [knownIds, projectOrder])
  const orderedProjects = useMemo(() => normalizedOrder
    .map(id => projects.find(p => p.id === id))
    .filter((p): p is (typeof projects)[number] => Boolean(p)), [normalizedOrder, projects])

  useEffect(() => {
    if (normalizedOrder.join('\0') !== projectOrder.join('\0')) {
      setProjectOrder(normalizedOrder)
    }
  }, [normalizedOrder, projectOrder, setProjectOrder])

  return (
    <aside aria-label="Projects" className={`flex shrink-0 flex-col gap-1 border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] py-2 transition-[width] duration-200 ease-[var(--ease-standard)] ${projectSidebarExpanded ? 'w-72' : 'w-12 items-center'}`}>
      <button
        type="button"
        onClick={toggleProjectSidebarExpanded}
        aria-label={projectSidebarExpanded ? 'Collapse project sidebar' : 'Expand project sidebar'}
        title={projectSidebarExpanded ? 'Collapse project sidebar' : 'Expand project sidebar'}
        className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        {projectSidebarExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>
      <div className={`rb-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto ${projectSidebarExpanded ? 'w-full gap-1' : 'items-center gap-1.5'}`}>
        {orderedProjects.map(p => (
          projectSidebarExpanded ? (
            <div
              key={p.id}
              draggable
              onDragStart={e => {
                setDraggedId(p.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnter={e => {
                e.preventDefault()
                if (draggedId && draggedId !== p.id) setDragOverId(p.id)
              }}
              onDragOver={e => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDragLeave={() => setDragOverId(prev => (prev === p.id ? null : prev))}
              onDrop={e => {
                e.preventDefault()
                if (draggedId) reorder(draggedId, p.id)
                setDraggedId(null)
                setDragOverId(null)
              }}
              onDragEnd={() => {
                setDraggedId(null)
                setDragOverId(null)
              }}
              className={`group relative mx-2 flex min-w-0 items-stretch rounded-[var(--radius-md)] transition-opacity ${
                draggedId === p.id ? 'opacity-40' : ''
              } ${
                dragOverId === p.id ? 'before:absolute before:-top-0.5 before:left-0 before:right-0 before:h-0.5 before:rounded-full before:bg-[var(--color-accent)]' : ''
              }`}
            >
              <span
                aria-hidden
                className="flex w-4 shrink-0 cursor-grab items-center justify-center text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
              >
                <GripVertical size={14} />
              </span>
              <NavLink
                to={`/project/${p.id}`}
                draggable={false}
                title={`${p.name}\n${p.path}`}
                className={({ isActive }) =>
                  `flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] border px-2 py-2 text-left transition-colors ${
                    isActive
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-glow)]'
                      : 'border-transparent hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)]'
                  }`
                }
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xs font-semibold text-white" style={{ backgroundColor: projectColor(p.id) }}>
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{p.name}</span>
                  <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{p.path}</span>
                  <span className="mt-1 block text-[11px] text-[var(--color-text-secondary)]">
                    {running(p.id) ? 'active session' : 'idle'}
                  </span>
                </span>
              </NavLink>
              <button
                type="button"
                onClick={() => setDeleteProjectId(p.id)}
                aria-label={`Remove ${p.name}`}
                title="Remove project"
                className="absolute bottom-1.5 right-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-destructive)] opacity-0 transition-opacity hover:underline group-hover:opacity-100 focus-visible:opacity-100"
              >
                remove
              </button>
            </div>
          ) : (
            <NavLink key={p.id} to={`/project/${p.id}`} title={`${p.name}\n${p.path}`}
              onMouseEnter={e => show(p.name, e, p.path)} onMouseLeave={() => setTip(null)}
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
          )
        ))}
        <button type="button" onClick={() => setAddProjectOpen(true)} aria-label="Add project" title="Add project"
          onMouseEnter={e => show('Add project', e)} onMouseLeave={() => setTip(null)}
          className={projectSidebarExpanded
            ? 'mx-2 flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-overlay)]/20 px-2 py-2 text-left text-[var(--color-text-muted)] transition-all hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-glow)] hover:text-[var(--color-accent)]'
            : 'flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-overlay)]/20 text-[var(--color-text-muted)] transition-all hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-glow)] hover:text-[var(--color-accent)]'}>
          <Plus size={18} className="shrink-0" />
          {projectSidebarExpanded && <span className="truncate text-sm font-medium">Add project</span>}
        </button>
      </div>
      <div className={`flex border-t border-[var(--color-border-subtle)] pt-2 ${projectSidebarExpanded ? 'mx-2 flex-row justify-between' : 'flex-col items-center gap-1'}`}>
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
        <span className="pointer-events-none fixed z-[60] flex max-w-xs -translate-y-1/2 flex-col gap-0.5 whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-2 py-1 text-xs text-[var(--color-text-primary)] shadow-[var(--shadow-modal)]"
          style={{ left: 52, top: tip.y }}>
          <span className="font-medium">{tip.label}</span>
          {tip.sub && <span className="rb-mono truncate text-[10px] text-[var(--color-text-muted)]">{tip.sub}</span>}
        </span>
      )}
    </aside>
  )
}
