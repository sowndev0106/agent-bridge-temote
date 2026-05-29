import { Link } from 'react-router-dom'
import type { Project, Session } from '../../types'
import { initials, projectHue, formatRelativeTime } from '../lib/format'

export default function ProjectCard({ project, sessions }: { project: Project; sessions: Session[] }) {
  const mine = sessions.filter(s => s.projectId === project.id)
  const running = mine.filter(s => s.state === 'running' || s.state === 'launching').length
  const lastActivity = mine.length
    ? mine.reduce((a, s) => Math.max(a, Date.parse(s.startedAt)), 0)
    : Date.parse(project.createdAt)
  const hue = projectHue(project.id)

  return (
    <Link to={`/project/${project.id}`}
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:shadow-[var(--shadow-modal)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-xs font-semibold text-white" style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}>
          {initials(project.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">{project.name}</span>
          <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{project.path}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        {running > 0 ? (
          <span className="flex items-center gap-1 text-[var(--color-running)]"><span className="h-2 w-2 rounded-full bg-[var(--color-running)]" /> {running} running</span>
        ) : (
          <span className="text-[var(--color-text-muted)]">idle</span>
        )}
        <span className="text-[var(--color-text-muted)]">· {formatRelativeTime(new Date(lastActivity).toISOString())}</span>
      </div>
    </Link>
  )
}
