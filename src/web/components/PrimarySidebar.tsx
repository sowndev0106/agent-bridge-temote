import { useState } from 'react'
import { useMatch } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw, TerminalSquare } from 'lucide-react'
import { useProjectsStore } from '../stores/projects'
import { useSessionsStore } from '../stores/sessions'
import { sendWsMessage } from '../lib/ws'
import FileTree from './FileTree'
import SessionRow from './SessionRow'
import { compareSessions } from '../lib/format'

function Section({ title, defaultOpen = true, actions, children }: {
  title: string; defaultOpen?: boolean; actions?: React.ReactNode; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex flex-1 items-center gap-1 hover:text-[var(--color-text-primary)]">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{title}
        </button>
        {open && actions}
      </div>
      {open && children}
    </div>
  )
}

export default function PrimarySidebar() {
  const match = useMatch('/project/:projectId')
  const projectId = match?.params.projectId
  const project = useProjectsStore(s => s.projects.find(p => p.id === projectId))
  const sessions = useSessionsStore(s => s.sessions)
  const [treeKey, setTreeKey] = useState(0)

  if (!project) {
    return <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-[var(--color-text-muted)]">Select a project from the activity bar.</div>
  }

  const mine = [...sessions.filter(s => s.projectId === project.id)].sort(compareSessions)
  const openShell = () => sendWsMessage({ type: 'terminal.create', payload: { cwd: project.path, projectId: project.id } })

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-surface)]">
      <div className="flex h-8 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">{project.name}</div>
      <div className="flex min-h-0 flex-[2] flex-col border-t border-[var(--color-border-subtle)]">
        <Section title="Explorer" actions={
          <button type="button" onClick={() => setTreeKey(k => k + 1)} title="Refresh" className="rb-icon-button h-5 min-h-5 w-5 min-w-5">
            <RefreshCw size={12} />
          </button>
        }>
          <FileTree key={treeKey} project={project} />
        </Section>
      </div>
      <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--color-border-subtle)]">
        <Section title="Sessions" actions={
          <button type="button" onClick={openShell} title="Shell here" className="rb-icon-button h-5 min-h-5 w-5 min-w-5">
            <TerminalSquare size={12} />
          </button>
        }>
          <div className="rb-scrollbar min-h-0 flex-1 overflow-y-auto">
            {mine.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--color-text-muted)]">No sessions yet.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {mine.map(s => <SessionRow key={s.id} session={s} />)}
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
