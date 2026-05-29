import { useEffect, useState } from 'react'
import { ChevronLeft, Folder, FolderOpen, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '../stores/ui'
import { useProjectsStore } from '../stores/projects'
import { api } from '../lib/api'

function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

export default function AddProjectModal() {
  const { addProjectOpen, setAddProjectOpen } = useUIStore()
  const { projects, addProject } = useProjectsStore()
  const navigate = useNavigate()
  const [cwd, setCwd] = useState('')
  const [parent, setParent] = useState<string | null>(null)
  const [entries, setEntries] = useState<{ name: string; path: string }[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (path?: string) => {
    setBusy(true); setError(null)
    try {
      const res = await api.browseFolder(path)
      setCwd(res.path); setParent(res.parent); setEntries(res.entries); setQuery('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot read folder')
    } finally { setBusy(false) }
  }

  useEffect(() => { if (addProjectOpen) load() }, [addProjectOpen])

  if (!addProjectOpen) return null

  const close = () => setAddProjectOpen(false)
  const filtered = entries.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
  const knownPaths = new Set(projects.map(p => p.path.replace(/\/+$/, '')))

  const openExisting = (id: string) => { close(); navigate(`/project/${id}`) }

  const openThisFolder = async () => {
    const existing = projects.find(p => p.path.replace(/\/+$/, '') === cwd.replace(/\/+$/, ''))
    if (existing) { openExisting(existing.id); return }
    setBusy(true); setError(null)
    try {
      const project = await api.createProject({ name: basename(cwd), path: cwd, env: {} })
      addProject(project)
      close()
      navigate(`/project/${project.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="Open project"
        className="rb-safe-bottom flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)] sm:max-h-[80dvh] sm:max-w-xl sm:rounded-[var(--radius-xl)]"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Open project</h2>
          <button type="button" onClick={close} className="rb-icon-button h-8 min-h-8 w-8 min-w-8 border-transparent" aria-label="Close" title="Close"><X size={16} /></button>
        </div>

        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 focus-within:border-[var(--color-accent)]">
            <Search size={15} className="shrink-0 text-[var(--color-text-muted)]" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search folders" autoFocus
              className="w-full bg-transparent py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none" />
          </div>
        </div>

        {projects.length > 0 && query.length === 0 && (
          <div className="px-5 pb-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Recent projects</p>
            <div className="space-y-0.5">
              {projects.slice(0, 3).map(p => (
                <button key={p.id} type="button" onClick={() => openExisting(p.id)}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)]">
                  <FolderOpen size={16} className="shrink-0 text-[var(--color-text-secondary)]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-[var(--color-text-primary)]">{p.name}</span>
                    <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{p.path}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-[var(--color-border-subtle)] px-5 py-2.5">
          <button type="button" disabled={!parent || busy} onClick={() => parent && load(parent)}
            className="rb-icon-button h-7 min-h-7 w-7 min-w-7 disabled:opacity-30" aria-label="Up one folder" title="Up one folder">
            <ChevronLeft size={15} />
          </button>
          <span className="rb-mono min-w-0 flex-1 truncate text-xs text-[var(--color-text-secondary)]">{cwd || '…'}</span>
        </div>

        {error && <p className="px-5 pb-1 pt-1 text-xs text-[var(--color-failed)]">{error}</p>}

        <div className="rb-scrollbar min-h-[160px] flex-1 overflow-y-auto px-3 pb-2">
          {busy && entries.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-[var(--color-text-muted)]">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-[var(--color-text-muted)]">No subfolders here</p>
          ) : (
            filtered.map(e => {
              const isProject = knownPaths.has(e.path.replace(/\/+$/, ''))
              return (
                <button key={e.path} type="button" onClick={() => load(e.path)}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)]">
                  <Folder size={16} className={`shrink-0 ${isProject ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} />
                  <span className="truncate text-sm text-[var(--color-text-primary)]">{e.name}</span>
                  {isProject && <span className="ml-auto shrink-0 rounded-full bg-[var(--color-accent-glow)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">project</span>}
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
          <button type="button" onClick={close} className="rb-ghost-button px-4">Cancel</button>
          <button type="button" onClick={openThisFolder} disabled={busy || !cwd} className="rb-primary-button gap-1.5 px-4 disabled:opacity-50">
            <FolderOpen size={15} />
            {busy ? 'Working…' : 'Open this folder'}
          </button>
        </div>
      </div>
    </div>
  )
}
