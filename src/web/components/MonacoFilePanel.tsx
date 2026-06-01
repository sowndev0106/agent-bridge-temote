import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Loader2, Save, Binary, FileCode2 } from 'lucide-react'
import { api } from '../lib/api'
import { useEditorStore } from '../stores/editor'
import { useUIStore } from '../stores/ui'
import type { FilePreviewResult } from '../../types'

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html',
  py: 'python', go: 'go', rs: 'rust', java: 'java', sh: 'shell', yml: 'yaml',
  yaml: 'yaml', toml: 'ini', sql: 'sql', xml: 'xml'
}
const langFor = (path: string) => EXT_LANG[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'

export default function MonacoFilePanel({ tabId, projectId, path }: {
  tabId: string; projectId: string; path: string
}) {
  const [preview, setPreview] = useState<FilePreviewResult | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savedRef = useRef('')
  const setDirty = useEditorStore(s => s.setDirty)
  const addToast = useUIStore(s => s.addToast)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    api.getProjectFilePreview(projectId, path)
      .then(res => {
        if (cancelled) return
        setPreview(res)
        if (res.type === 'text') { setContent(res.content); savedRef.current = res.content }
      })
      .catch(e => !cancelled && setError(e instanceof Error ? e.message : 'Cannot preview file'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [projectId, path])

  const dirty = preview?.type === 'text' && content !== savedRef.current
  useEffect(() => { setDirty(tabId, dirty) }, [dirty, tabId, setDirty])

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await api.writeProjectFile(projectId, path, content)
      savedRef.current = content
      setDirty(tabId, false)
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Cannot save file')
    } finally {
      setSaving(false)
    }
  }

  // Keep a ref pointing at the latest `save` so the Monaco command (registered
  // once in onMount) always invokes the current closure with up-to-date
  // content/dirty state instead of the stale first-render closure.
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })

  if (loading) return <Centered><Loader2 size={16} className="animate-spin" /> Loading…</Centered>
  if (error) return <Centered className="text-[var(--color-failed)]">{error}</Centered>
  if (preview && preview.type !== 'text') {
    return (
      <Centered>
        {preview.type === 'binary' ? <Binary size={16} /> : <FileCode2 size={16} />}
        {preview.type === 'too_large' ? 'File too large to preview.' :
         preview.type === 'directory' ? 'This is a directory.' :
         'Preview not available for this file.'}
      </Centered>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-base)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
        <span className="rb-mono truncate text-[11px] text-[var(--color-text-muted)]">{path}</span>
        <button type="button" onClick={save} disabled={!dirty || saving}
          className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1 text-xs transition-all ${
            dirty ? 'bg-[var(--color-accent)] text-white hover:brightness-110'
                  : 'cursor-not-allowed text-[var(--color-text-muted)]'}`}
          title="Save (Ctrl+S)">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          theme="vs-dark"
          language={langFor(path)}
          value={content}
          onChange={(v) => setContent(v ?? '')}
          onMount={(editor, monaco) => {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { void saveRef.current() })
          }}
          options={{ fontSize: 12, minimap: { enabled: true }, scrollBeyondLastLine: false, automaticLayout: true }}
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
