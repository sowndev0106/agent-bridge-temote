import { useState } from 'react'
import { useUIStore } from '../stores/ui'
import { useProjectsStore } from '../stores/projects'
import { api } from '../lib/api'

function parseEnv(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw.split('\n')
      .map(l => l.trim())
      .filter(l => l.includes('='))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
  )
}

export default function AddProjectModal() {
  const { addProjectOpen, setAddProjectOpen } = useUIStore()
  const { addProject } = useProjectsStore()
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [envRaw, setEnvRaw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!addProjectOpen) return null

  const save = async () => {
    setError(''); setLoading(true)
    try {
      const project = await api.createProject({ name, path, env: parseEnv(envRaw) })
      addProject(project)
      setAddProjectOpen(false)
      setName(''); setPath(''); setEnvRaw('')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setAddProjectOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Project"
        className="rb-safe-bottom max-h-[100dvh] w-full overflow-hidden rounded-t-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)] sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[var(--radius-xl)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Add Project</h2>
          <button type="button" onClick={() => setAddProjectOpen(false)} className="rb-icon-button" aria-label="Close add project" title="Close">x</button>
        </div>
        <div className="rb-scrollbar max-h-[calc(100dvh-128px)] space-y-4 overflow-y-auto p-4 sm:max-h-[calc(90dvh-128px)]">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="rb-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Absolute Path *</label>
            <input value={path} onChange={e => setPath(e.target.value)}
              placeholder="/home/user/projects/my-app"
              className="rb-input rb-mono text-[13px]" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">Environment Variables (optional, KEY=VALUE per line)</label>
            <textarea value={envRaw} onChange={e => setEnvRaw(e.target.value)} rows={3}
              className="rb-input rb-mono min-h-24 resize-y text-[13px]" />
          </div>
          {error && <p className="break-words text-xs text-[var(--color-failed)]">{error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] p-4">
          <button type="button" onClick={() => setAddProjectOpen(false)} className="rb-ghost-button">Cancel</button>
          <button type="button" onClick={save} disabled={loading || !name || !path} className="rb-primary-button disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
