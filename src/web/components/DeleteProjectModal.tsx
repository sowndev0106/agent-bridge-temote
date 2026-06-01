import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMatch, useNavigate } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { api } from '../lib/api'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useUIStore } from '../stores/ui'

export default function DeleteProjectModal() {
  const navigate = useNavigate()
  const match = useMatch('/project/:projectId')
  const deleteProjectId = useUIStore(s => s.deleteProjectId)
  const setDeleteProjectId = useUIStore(s => s.setDeleteProjectId)
  const removeProjectFromOrder = useUIStore(s => s.removeProjectFromOrder)
  const addToast = useUIStore(s => s.addToast)
  const projects = useProjectsStore(s => s.projects)
  const removeProject = useProjectsStore(s => s.removeProject)
  const sessions = useSessionsStore(s => s.sessions)
  const [deleting, setDeleting] = useState(false)
  const project = projects.find(p => p.id === deleteProjectId)

  const liveSessions = project
    ? sessions.filter(session =>
      session.projectId === project.id && (session.state === 'launching' || session.state === 'running')
    )
    : []
  const blocked = liveSessions.length > 0

  useEffect(() => {
    setDeleting(false)
  }, [deleteProjectId])

  useEffect(() => {
    if (project && blocked) {
      addToast('Stop running sessions before deleting this project.')
    }
  }, [addToast, blocked, project])

  if (!deleteProjectId || !project) return null

  const close = () => {
    if (!deleting) setDeleteProjectId(null)
  }

  const confirm = async () => {
    if (blocked) {
      addToast('Stop running sessions before deleting this project.')
      return
    }

    setDeleting(true)
    try {
      await api.deleteProject(project.id)
      removeProject(project.id)
      removeProjectFromOrder(project.id)
      setDeleteProjectId(null)
      if (match?.params.projectId === project.id) {
        navigate('/', { replace: true })
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to delete project')
      setDeleting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete project"
        className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle size={17} className="shrink-0 text-[var(--color-warning)]" />
            <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">Delete project</h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="rb-icon-button h-8 min-h-8 w-8 min-w-8"
            aria-label="Close delete project"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-[var(--color-text-secondary)]">
          <p>
            Delete <span className="font-medium text-[var(--color-text-primary)]">{project.name}</span> from RemoteBridge.
          </p>
          <p className="rb-mono break-all rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] px-3 py-2 text-[11px] text-[var(--color-text-code)]">
            {project.path}
          </p>
          {blocked && (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-warning)]">
              Stop {liveSessions.length} launching or running session{liveSessions.length === 1 ? '' : 's'} before deleting this project.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-border-subtle)] px-4 py-3">
          <button type="button" onClick={close} className="rb-ghost-button px-4" disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={blocked || deleting}
            className="rb-primary-button bg-[var(--color-destructive)] px-4 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete project permanently
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
