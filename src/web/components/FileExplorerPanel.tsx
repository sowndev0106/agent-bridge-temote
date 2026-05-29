import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, FileText, RefreshCw, TerminalSquare } from 'lucide-react'
import { api } from '../lib/api'
import { sendWsMessage } from '../lib/ws'
import FilePreview from './FilePreview'
import type { FileEntry, FileListResult, FilePreviewResult, Project } from '../../types'

function joinDisplayPath(root: string, rel: string): string {
  return rel ? `${root.replace(/\/+$/, '')}/${rel}` : root
}

function fileIcon(entry: FileEntry, active: boolean) {
  const cls = active ? 'text-[var(--color-accent)] animate-pulse' : 'text-[var(--color-text-muted)]'
  if (entry.type === 'directory') return active ? <FolderOpen size={16} className={cls} /> : <Folder size={16} className={cls} />
  return <FileText size={16} className={cls} />
}

export default function FileExplorerPanel({ project }: { project: Project }) {
  const [listing, setListing] = useState<FileListResult | null>(null)
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [preview, setPreview] = useState<FilePreviewResult | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [savingPreview, setSavingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const loadPath = async (path = '') => {
    setLoadingList(true)
    setError(null)
    try {
      const res = await api.listProjectFiles(project.id, path)
      setListing(res)
      setSelected(null)
      setPreview(null)
      setPreviewError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot read folder')
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    loadPath('')
  }, [project.id])

  const breadcrumbs = useMemo(() => {
    const parts = listing?.path ? listing.path.split(/[\\/]+/).filter(Boolean) : []
    const crumbs = [{ label: project.name, path: '' }]
    let current = ''
    for (const part of parts) {
      current = current ? `${current}/${part}` : part
      crumbs.push({ label: part, path: current })
    }
    return crumbs
  }, [listing?.path, project.name])

  const selectEntry = async (entry: FileEntry) => {
    setSelected(entry)
    setPreview(null)
    setPreviewError(null)
    if (entry.type === 'directory') return
    setLoadingPreview(true)
    try {
      setPreview(await api.getProjectFilePreview(project.id, entry.path))
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Cannot preview file')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleSaveFile = async (content: string) => {
    if (!selected) return
    setSavingPreview(true)
    setPreviewError(null)
    try {
      await api.writeProjectFile(project.id, selected.path, content)
      setPreview((prev) => (prev && prev.type === 'text' ? { ...prev, content } : prev))
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Cannot save file')
    } finally {
      setSavingPreview(false)
    }
  }

  const openShellHere = () => {
    const cwd = listing ? joinDisplayPath(listing.rootPath, listing.path) : project.path
    sendWsMessage({ type: 'terminal.create', payload: { cwd, projectId: project.id } })
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/55 shadow-[var(--shadow-card)] transition-all hover:bg-[var(--color-bg-surface)]/60" aria-label="File explorer">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3 bg-[var(--color-bg-base)]/25 backdrop-blur-sm">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">Files</h2>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-[var(--color-text-muted)]">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.path || 'root'} className="flex min-w-0 items-center gap-1">
                {index > 0 && <ChevronRight size={12} className="shrink-0" />}
                <button type="button" onClick={() => loadPath(crumb.path)} className="max-w-[160px] truncate hover:text-[var(--color-text-primary)] transition-colors cursor-pointer">
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => loadPath(listing?.path ?? '')} className="rb-icon-button h-8 min-h-8 w-8 min-w-8" aria-label="Refresh files" title="Refresh files">
            <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={openShellHere} className="rb-ghost-button px-3 cursor-pointer" title="Open a shell in this folder">
            <TerminalSquare size={14} /> Shell here
          </button>
        </div>
      </div>

      <div className="grid min-h-[320px] grid-cols-1 md:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
        <div className="border-b border-[var(--color-border-subtle)] md:border-b-0 md:border-r">
          <div className="rb-scrollbar max-h-[340px] overflow-y-auto p-2 md:max-h-[440px]">
            {listing?.parent !== null && listing && (
              <button type="button" onClick={() => loadPath(listing.parent ?? '')} className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer">
                <FolderOpen size={16} className="text-[var(--color-text-muted)]" /> ..
              </button>
            )}
            {loadingList && !listing ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--color-text-muted)]">Loading files</p>
            ) : error ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--color-failed)]">{error}</p>
            ) : listing?.entries.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-[var(--color-text-muted)]">This folder is empty</p>
            ) : (
              listing?.entries.map(entry => {
                const active = selected?.path === entry.path
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onDoubleClick={() => entry.type === 'directory' && loadPath(entry.path)}
                    onClick={() => entry.type === 'directory' ? loadPath(entry.path) : selectEntry(entry)}
                    className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-all cursor-pointer ${active ? 'bg-[var(--color-accent-glow)] text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}`}
                  >
                    {fileIcon(entry, active)}
                    <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
                    {entry.type !== 'directory' && <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{entry.size !== null ? `${entry.size} B` : ''}</span>}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <FilePreview
          selected={selected}
          preview={preview}
          loading={loadingPreview}
          error={previewError}
          onSave={handleSaveFile}
          saving={savingPreview}
        />
      </div>
    </section>
  )
}
