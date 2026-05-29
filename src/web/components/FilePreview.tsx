import { useEffect, useState } from 'react'
import { Binary, FileCode2, FolderOpen, Loader2, Save } from 'lucide-react'
import type { FileEntry, FilePreviewResult } from '../../types'

function formatSize(size: number | null): string {
  if (size === null) return 'folder'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export default function FilePreview({
  selected,
  preview,
  loading,
  error,
  onSave,
  saving
}: {
  selected: FileEntry | null
  preview: FilePreviewResult | null
  loading: boolean
  error: string | null
  onSave?: (content: string) => Promise<void>
  saving?: boolean
}) {
  const [localContent, setLocalContent] = useState('')

  // Keep local content in sync when a new preview loads
  useEffect(() => {
    if (preview?.type === 'text') {
      setLocalContent(preview.content)
    } else {
      setLocalContent('')
    }
  }, [preview])

  const isDirty = preview?.type === 'text' && localContent !== preview.content

  // Handle Ctrl+S / Cmd+S hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (isDirty && onSave && !saving) {
          onSave(localContent)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDirty, localContent, onSave, saving])

  if (!selected) {
    return (
      <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 text-center">
        <FolderOpen size={28} className="text-[var(--color-text-muted)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">Select a file</p>
        <p className="max-w-[280px] text-xs leading-relaxed text-[var(--color-text-muted)]">
          Browse the project tree, preview and edit source files directly.
        </p>
      </div>
    )
  }

  const handleSaveClick = () => {
    if (isDirty && onSave && !saving) {
      onSave(localContent)
    }
  }

  return (
    <div className="flex min-h-[240px] flex-1 flex-col overflow-hidden">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 bg-[var(--color-bg-base)]/50">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">{selected.name}</p>
          <p className="rb-mono truncate text-[11px] text-[var(--color-text-muted)]">{selected.path}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-[var(--color-text-muted)]">{formatSize(selected.size)}</span>
          {preview?.type === 'text' && onSave && (
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={!isDirty || saving}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-[var(--radius-md)] text-xs font-medium transition-all ${
                isDirty
                  ? 'bg-[var(--color-accent)] text-white shadow-[0_2px_4px_rgba(var(--color-accent-rgb),0.35)] hover:brightness-110 active:scale-95 cursor-pointer'
                  : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] cursor-not-allowed border border-[var(--color-border-subtle)]'
              }`}
              title="Save changes (Ctrl+S / Cmd+S)"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-base)]/10">
          <Loader2 size={14} className="animate-spin" /> Loading preview
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-[var(--color-failed)] bg-[var(--color-bg-base)]/10">{error}</div>
      ) : preview?.type === 'text' ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg-base)] relative">
          {preview.truncated && (
            <div className="absolute top-3 left-3 right-3 z-10 rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]/90 backdrop-blur-sm px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              Preview truncated at 128 KiB. Editing oversized files is disabled.
            </div>
          )}
          <textarea
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
            disabled={preview.truncated || saving}
            className="flex-1 resize-none w-full border-0 bg-transparent p-4 rb-mono text-[12px] leading-6 text-[var(--color-text-code)] focus:ring-0 focus:outline-none rb-scrollbar overflow-auto focus:border-0"
            placeholder="File is empty"
          />
        </div>
      ) : preview?.type === 'directory' ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-base)]/10">
          <FolderOpen size={15} /> Open the folder to inspect its contents.
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-base)]/10">
          {preview?.type === 'binary' ? <Binary size={15} /> : <FileCode2 size={15} />}
          Preview is not available for this file.
        </div>
      )}
    </div>
  )
}
