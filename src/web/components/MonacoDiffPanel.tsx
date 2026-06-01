import { useEffect, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import './../lib/monaco-setup'
import { Loader2, RefreshCw, FileCode2, Split } from 'lucide-react'
import { api } from '../lib/api'
import { useEditorStore } from '../stores/editor'
import type { GitFileDiffResult } from '../../types'

export default function MonacoDiffPanel({ projectId, path }: {
  tabId: string; projectId: string; path: string
}) {
  const [diff, setDiff] = useState<GitFileDiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sideBySide, setSideBySide] = useState(true)
  
  const openFile = useEditorStore(s => s.openFile)

  const fetchDiff = () => {
    setLoading(true)
    setError(null)
    api.getGitDiff(projectId, path)
      .then(res => {
        setDiff(res)
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : 'Cannot load diff')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchDiff()
  }, [projectId, path])

  if (loading) return <Centered><Loader2 size={16} className="animate-spin" /> Loading diff…</Centered>
  if (error) return <Centered className="text-[var(--color-failed)]">{error}</Centered>

  const language = path.split('.').pop()?.toLowerCase() || 'plaintext'

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-base)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
        <span className="rb-mono truncate text-[11px] text-[var(--color-text-muted)]">
          Diff: <span className="text-[var(--color-text-secondary)]">{path}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSideBySide(!sideBySide)}
            className={`flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-xs border border-[var(--color-border-default)] transition-colors hover:bg-[var(--color-bg-hover)] ${
              sideBySide ? 'text-[var(--color-accent)] border-[var(--color-accent)] bg-[var(--color-accent-glow)]' : 'text-[var(--color-text-secondary)]'
            }`}
            title={sideBySide ? 'Switch to unified diff' : 'Switch to split diff'}
          >
            <Split size={13} />
            <span>{sideBySide ? 'Split' : 'Unified'}</span>
          </button>

          <button
            type="button"
            onClick={() => openFile(projectId, path)}
            className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            title="Open file for editing"
          >
            <FileCode2 size={13} />
            <span>Open File</span>
          </button>

          <button
            type="button"
            onClick={fetchDiff}
            className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            title="Refresh diff"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <DiffEditor
          height="100%"
          theme="vs-dark"
          language={language}
          original={diff?.baseContent ?? ''}
          modified={diff?.currentContent ?? ''}
          options={{
            fontSize: 12,
            readOnly: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderSideBySide: sideBySide
          }}
        />
      </div>
    </div>
  )
}

function Centered({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-full items-center justify-center gap-2 bg-[var(--color-bg-base)] text-xs text-[var(--color-text-muted)] ${className}`}>
      {children}
    </div>
  )
}
