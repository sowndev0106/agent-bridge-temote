import { useState, useEffect, useMemo } from 'react'
import { useMatch } from 'react-router-dom'
import { ChevronDown, ChevronUp, ChevronRight, RefreshCw, TerminalSquare, Loader2, GitBranch, FolderOpen, Folder, FolderTree, List } from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { useEditorStore } from '../stores/editor'
import { api } from '../lib/api'
import { sendWsMessage } from '../lib/ws'
import FileTree from './FileTree'
import SessionRow from './SessionRow'
import { compareSessions } from '../lib/format'
import { fileIconSpec } from '../lib/fileIcons'
import type { GitStatusResult } from '../../types'

function Section({
  title,
  open,
  onToggle,
  actions,
  children,
  openClassName = 'flex-1',
  icon,
  draggable,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragging
}: {
  title: string
  open: boolean
  onToggle: () => void
  actions?: React.ReactNode
  children: React.ReactNode
  openClassName?: string
  icon?: React.ReactNode
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnter?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  isDragOver?: boolean
  isDragging?: boolean
}) {
  const bodyId = `${title.toLowerCase().replace(/\s+/g, '-')}-section`
  return (
    <div
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group/section flex min-h-0 flex-col border-t border-[var(--color-border-subtle)] transition-all duration-200 ${
        open ? openClassName : 'shrink-0'
      } ${
        isDragOver ? 'border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent-glow)]/10 opacity-75' : ''
      }`}
    >
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="flex h-7 shrink-0 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-hover)] cursor-grab active:cursor-grabbing transition-colors duration-150 select-none"
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex flex-1 items-center gap-1.5 hover:text-[var(--color-text-primary)] min-w-0"
        >
          {open ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
          {icon}
          <span className="truncate">{title}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/section:opacity-100 focus-within:opacity-100 transition-opacity">
          {open && actions}
        </div>
      </div>
      {open && (
        <div id={bodyId} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${isDragging ? 'pointer-events-none' : ''}`}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function PrimarySidebar() {
  const match = useMatch('/project/:projectId')
  const projectId = match?.params.projectId
  const project = useProjectsStore(s => s.projects.find(p => p.id === projectId))
  const sessions = useSessionsStore(s => s.sessions)
  const [treeKey, setTreeKey] = useState(0)

  const [sectionOrder, setSectionOrder] = useState<string[]>(['explorer', 'source-control', 'sessions'])
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({
    explorer: true,
    'source-control': true,
    sessions: true
  })
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Load from localStorage when project changes
  useEffect(() => {
    if (!project) return
    const key = `arc:sidebar:${project.id}`
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.order && Array.isArray(parsed.order)) {
          const validOrder = parsed.order.filter((id: string) => ['explorer', 'source-control', 'sessions'].includes(id))
          const missing = ['explorer', 'source-control', 'sessions'].filter(id => !validOrder.includes(id))
          setSectionOrder([...validOrder, ...missing])
        }
        if (parsed.openStates) {
          setOpenStates(parsed.openStates)
        }
      } else {
        setSectionOrder(['explorer', 'source-control', 'sessions'])
        setOpenStates({
          explorer: true,
          'source-control': true,
          sessions: true
        })
      }
    } catch (e) {
      // ignore
    }
  }, [project?.id])

  const saveState = (newOrder: string[], newOpenStates: Record<string, boolean>) => {
    if (!project) return
    const key = `arc:sidebar:${project.id}`
    localStorage.setItem(key, JSON.stringify({ order: newOrder, openStates: newOpenStates }))
  }

  const toggleSection = (id: string) => {
    const updated = {
      ...openStates,
      [id]: !openStates[id]
    }
    setOpenStates(updated)
    saveState(sectionOrder, updated)
  }

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDragEnter = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    if (draggedId && draggedId !== id) {
      setDragOverId(id)
    }
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDragOverId(null)
    if (!draggedId || draggedId === targetId) return

    const draggedIndex = sectionOrder.indexOf(draggedId)
    const targetIndex = sectionOrder.indexOf(targetId)
    if (draggedIndex === -1 || targetIndex === -1) return

    const newOrder = [...sectionOrder]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, draggedId)

    setSectionOrder(newOrder)
    saveState(newOrder, openStates)
    setDraggedId(null)
  }

  if (!project) {
    return <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-[var(--color-text-muted)]">Select a project from the activity bar.</div>
  }

  const mine = [...sessions.filter(s => s.projectId === project.id)].sort(compareSessions)
  const openShell = () => sendWsMessage({ type: 'terminal.create', payload: { cwd: project.path, projectId: project.id } })

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-surface)]">
      <div className="flex h-8 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">{project.name}</div>
      {sectionOrder.map((sectionId) => {
        const isOver = dragOverId === sectionId

        const dragProps = {
          draggable: true,
          onDragStart: (e: React.DragEvent) => handleDragStart(e, sectionId),
          onDragOver: handleDragOver,
          onDragEnter: (e: React.DragEvent) => handleDragEnter(e, sectionId),
          onDragLeave: handleDragLeave,
          onDrop: (e: React.DragEvent) => handleDrop(e, sectionId),
          onDragEnd: handleDragEnd,
          isDragOver: isOver,
          isDragging: draggedId !== null
        }

        if (sectionId === 'explorer') {
          return (
            <Section
              key="explorer"
              title="Explorer"
              open={openStates.explorer}
              onToggle={() => toggleSection('explorer')}
              icon={<FolderOpen size={13} />}
              {...dragProps}
              actions={
                <button type="button" onClick={() => setTreeKey(k => k + 1)} title="Refresh" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors">
                  <RefreshCw size={12} />
                </button>
              }>
              <div className="rb-scrollbar min-h-0 flex-1 overflow-y-auto">
                <FileTree key={treeKey} project={project} />
              </div>
            </Section>
          )
        }

        if (sectionId === 'source-control') {
          return (
            <SourceControlSection
              key="source-control"
              projectId={project.id}
              open={openStates['source-control']}
              onToggle={() => toggleSection('source-control')}
              {...dragProps}
            />
          )
        }

        if (sectionId === 'sessions') {
          return (
            <Section
              key="sessions"
              title="Sessions"
              open={openStates.sessions}
              onToggle={() => toggleSection('sessions')}
              icon={<TerminalSquare size={13} />}
              {...dragProps}
              actions={
                <button type="button" onClick={openShell} title="Shell here" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors">
                  <TerminalSquare size={12} />
                </button>
              }>
              <div className="rb-scrollbar min-h-0 flex-1 overflow-y-auto">
                {mine.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-[var(--color-text-muted)]">No sessions yet.</p>
                ) : (
                  <div className="divide-y divide-[var(--color-border-subtle)]">
                    {mine.map(s => <SessionRow key={s.id} session={s} compact />)}
                  </div>
                )}
              </div>
            </Section>
          )
        }

        return null
      })}
    </div>
  )
}

interface GitTreeItem {
  name: string
  path: string
  type: 'file' | 'folder'
  status?: string
  children: GitTreeItem[]
}

function buildGitTree(files: { path: string; status: string }[]): GitTreeItem[] {
  const rootChildren: GitTreeItem[] = []

  for (const file of files) {
    const parts = file.path.split('/')
    let currentLevel = rootChildren

    let currentPath = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLast = i === parts.length - 1

      let existing = currentLevel.find(item => item.name === part && item.type === (isLast ? 'file' : 'folder'))
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'folder',
          status: isLast ? file.status : undefined,
          children: []
        }
        currentLevel.push(existing)
      }
      currentLevel = existing.children
    }
  }

  const sortTree = (items: GitTreeItem[]) => {
    items.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1
      if (a.type !== 'folder' && b.type === 'folder') return 1
      return a.name.localeCompare(b.name)
    })
    for (const item of items) {
      if (item.children.length > 0) sortTree(item.children)
    }
  }
  sortTree(rootChildren)
  return rootChildren
}

function SourceControlSection({ 
  projectId, open, onToggle,
  draggable, onDragStart, onDragOver, onDragEnter, onDragLeave, onDrop, onDragEnd, isDragOver, isDragging
}: {
  projectId: string
  open: boolean
  onToggle: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDragEnter?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  isDragOver?: boolean
  isDragging?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({})
  const openDiff = useEditorStore(s => s.openDiff)

  const fetchStatus = () => {
    setLoading(true)
    api.getGitStatus(projectId)
      .then(res => setGitStatus(res))
      .catch(() => setGitStatus(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchStatus()
  }, [projectId])

  const toggleFolder = (path: string) => {
    setExpandedPaths(prev => ({
      ...prev,
      [path]: prev[path] === false ? true : false
    }))
  }

  const treeData = useMemo(() => {
    if (!gitStatus?.files) return []
    return buildGitTree(gitStatus.files)
  }, [gitStatus])

  const getStatusBadge = (status: string) => {
    const char = status.slice(-1)
    if (char === 'M') {
      return (
        <span className="flex h-4 w-4 items-center justify-center rounded-[var(--radius-sm)] text-[9px] font-bold text-[var(--color-launching)] bg-[var(--color-launching-dim)]/30 border border-[var(--color-launching)]/20" title="Modified">
          M
        </span>
      )
    }
    if (char === 'A') {
      return (
        <span className="flex h-4 w-4 items-center justify-center rounded-[var(--radius-sm)] text-[9px] font-bold text-[var(--color-running)] bg-[var(--color-running-dim)]/30 border border-[var(--color-running)]/20" title="Added">
          A
        </span>
      )
    }
    if (char === 'D') {
      return (
        <span className="flex h-4 w-4 items-center justify-center rounded-[var(--radius-sm)] text-[9px] font-bold text-[var(--color-failed)] bg-[var(--color-failed-dim)]/30 border border-[var(--color-failed)]/20" title="Deleted">
          D
        </span>
      )
    }
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded-[var(--radius-sm)] text-[9px] font-bold text-[var(--color-accent)] bg-[var(--color-accent-glow)] border border-[var(--color-accent)]/20" title="Untracked">
        U
      </span>
    )
  }

  const renderTreeItem = (item: GitTreeItem, depth: number) => {
    if (item.type === 'folder') {
      const isExpanded = expandedPaths[item.path] !== false
      const Icon = isExpanded ? FolderOpen : Folder
      return (
        <div key={item.path} className="flex flex-col">
          <button
            type="button"
            onClick={() => toggleFolder(item.path)}
            className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-0.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
            style={{ paddingLeft: 4 + depth * 12 }}
          >
            {isExpanded ? <ChevronDown size={11} className="shrink-0 text-[var(--color-text-muted)]" /> : <ChevronRight size={11} className="shrink-0 text-[var(--color-text-muted)]" />}
            <Icon size={13} className="shrink-0 text-[var(--color-text-muted)]" />
            <span className="truncate font-medium">{item.name}</span>
          </button>
          {isExpanded && item.children.map(child => renderTreeItem(child, depth + 1))}
        </div>
      )
    } else {
      const { Icon, color } = fileIconSpec(item.name)
      return (
        <button
          key={item.path}
          type="button"
          onClick={() => openDiff(projectId, item.path)}
          className="group flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-0.5 text-left text-xs transition-colors hover:bg-[var(--color-bg-hover)]"
          style={{ paddingLeft: 18 + depth * 12 }}
          title={`${item.path} (${item.status})`}
        >
          <div className="flex flex-1 items-center gap-1.5 min-w-0">
            <Icon size={13} className="shrink-0" style={{ color }} />
            <span className="truncate font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)]">
              {item.name}
            </span>
          </div>
          <div className="shrink-0 pl-2">
            {getStatusBadge(item.status || '')}
          </div>
        </button>
      )
    }
  }

  return (
    <Section
      title="Source Control"
      open={open}
      onToggle={onToggle}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      isDragOver={isDragOver}
      isDragging={isDragging}
      icon={<GitBranch size={13} />}
      actions={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'list' ? 'tree' : 'list')}
            title={viewMode === 'list' ? 'View as tree' : 'View as list'}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {viewMode === 'list' ? <FolderTree size={12} /> : <List size={12} />}
          </button>
          <button type="button" onClick={fetchStatus} title="Refresh changes" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      }
    >
      <div className="rb-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1.5 gap-1">
        {loading ? (
          <div className="flex items-center gap-1.5 px-2 py-2 text-xs text-[var(--color-text-muted)]">
            <Loader2 size={12} className="animate-spin" />
            <span>Scanning repository…</span>
          </div>
        ) : !gitStatus?.isGit ? (
          <p className="px-2 py-2 text-xs text-[var(--color-text-muted)] italic">Not a git repository.</p>
        ) : gitStatus.files.length === 0 ? (
          <p className="px-2 py-2 text-xs text-[var(--color-text-muted)] italic">No changes detected.</p>
        ) : viewMode === 'tree' ? (
          <div className="flex flex-col gap-0.5">
            {treeData.map(item => renderTreeItem(item, 0))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {gitStatus.files.map(file => {
              const parts = file.path.split('/')
              const name = parts.pop() ?? file.path
              const dir = parts.join('/')
              const { Icon, color } = fileIconSpec(name)
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => openDiff(projectId, file.path)}
                  className="group flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1 text-left text-xs transition-colors hover:bg-[var(--color-bg-hover)]"
                  title={`${file.path} (${file.status})`}
                >
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <Icon size={14} className="shrink-0" style={{ color }} />
                    <span className="truncate font-medium text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)]">
                      {name}
                    </span>
                    {dir && (
                      <span className="truncate rb-mono text-[10px] text-[var(--color-text-muted)]">
                        {dir}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 pl-2">
                    {getStatusBadge(file.status)}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </Section>
  )
}
