import { Navigate, useParams } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'

export default function ProjectWorkspace() {
  const { projectId } = useParams()
  const { projects } = useProjectsStore()
  const project = projects.find(p => p.id === projectId)
  if (!project) {
    return projects.length === 0
      ? <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
      : <Navigate to="/" replace />
  }
  return null
}
