import { useState, useEffect, useRef } from 'react'
import { useSessionsStore } from '../stores/sessions'
import { api } from '../lib/api'
import MonacoDiffPanel from './MonacoDiffPanel'
import { Send, Square, Check, X, Loader2, Code, Eye, RefreshCw } from 'lucide-react'
import type { GitFileStatus } from '../../types'

interface CodexChatPanelProps {
  sessionId: string
}

export default function CodexChatPanel({ sessionId }: CodexChatPanelProps) {
  const sessions = useSessionsStore(s => s.sessions)
  const session = sessions.find(s => s.id === sessionId)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([])
  const [selectedDiffPath, setSelectedDiffPath] = useState<string | null>(null)
  const [loadingGit, setLoadingGit] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.chatHistory, session?.activeTurn?.delta])

  const fetchGitStatus = () => {
    if (!session?.projectId) return
    setLoadingGit(true)
    api.getGitStatus(session.projectId)
      .then(res => {
        setGitFiles(res.files || [])
        // Auto-select first modified file for preview if none selected
        if (res.files && res.files.length > 0 && !selectedDiffPath) {
          setSelectedDiffPath(res.files[0].path)
        }
      })
      .catch(err => console.error('[CodexChatPanel] Failed to fetch git status:', err))
      .finally(() => setLoadingGit(false))
  }

  useEffect(() => {
    fetchGitStatus()
  }, [session?.projectId])

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-base)]">
        Session not found
      </div>
    )
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await api.sendCodexMessage(sessionId, input.trim())
      setInput('')
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const handleInterrupt = async () => {
    try {
      await api.interruptCodexTurn(sessionId)
    } catch (err) {
      console.error(err)
    }
  }

  const handleApproval = async (approvalId: string, decision: 'approved' | 'rejected') => {
    try {
      await api.resolveCodexApproval(sessionId, approvalId, decision)
      // Refresh git status after resolving approval to capture modifications
      setTimeout(fetchGitStatus, 1000)
    } catch (err) {
      console.error(err)
    }
  }

  const chatHistory = session.chatHistory || []
  const activeTurn = session.activeTurn

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--color-bg-base)]">
      {/* Split layout: Left is Chat, Right is Monaco Diff */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Feed Panel */}
        <div className="flex flex-1 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
          {/* Header */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-4 bg-[var(--color-bg-surface)]/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">🤖 OpenAI Codex</span>
              {session.state === 'running' && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-success)] bg-[var(--color-success-glow)] px-2 py-0.5 rounded-full font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                  Active
                </span>
              )}
            </div>
            <button
              onClick={fetchGitStatus}
              className="rb-icon-button"
              title="Refresh Workspace Git Status"
            >
              <RefreshCw size={13} className={loadingGit ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 && !activeTurn && (
              <div className="flex h-full flex-col items-center justify-center text-center p-6">
                <div className="h-12 w-12 rounded-2xl bg-[var(--color-accent-glow)] text-[var(--color-accent)] flex items-center justify-center mb-3">
                  <Code size={24} />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Codex Workspace</h3>
                <p className="mt-1 max-w-xs text-xs text-[var(--color-text-muted)]">
                  Ask Codex to write tests, fix bugs, explain code, or perform large refactors across your project files.
                </p>
              </div>
            )}

            {chatHistory.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                <div
                  className={`rounded-2xl p-3 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[var(--color-accent)] text-white rounded-br-none shadow-sm'
                      : 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] rounded-bl-none border border-[var(--color-border-subtle)]'
                  }`}
                >
                  {msg.content}
                </div>
                <span className="mt-1 text-[9px] text-[var(--color-text-muted)]">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {/* Active streaming message */}
            {activeTurn && (
              <div className="flex flex-col mr-auto items-start max-w-[85%] animate-fade-in">
                <div className="rounded-2xl p-3 text-xs leading-relaxed bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] rounded-bl-none border border-[var(--color-border-subtle)]">
                  {activeTurn.delta || (
                    <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                      <Loader2 size={12} className="animate-spin text-[var(--color-accent)]" />
                      Codex is analyzing...
                    </span>
                  )}
                </div>

                {/* Inline glassmorphic approval banner */}
                {activeTurn.approval && activeTurn.approval.status === 'pending' && (
                  <div className="mt-3 w-full rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 backdrop-blur-md shadow-sm border-l-4 border-l-[var(--color-accent)]">
                    <div className="text-[10px] font-semibold text-[var(--color-text-primary)] mb-1 flex items-center gap-1">
                      <span>🔐 Executive Command Authorization Required</span>
                    </div>
                    <code className="block bg-black/30 text-white p-2 rounded-lg font-mono text-[10px] mb-3 overflow-x-auto whitespace-pre">
                      {activeTurn.approval.command}
                    </code>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproval(activeTurn.approval!.id, 'approved')}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 text-white font-semibold text-[10px] transition-all"
                      >
                        <Check size={11} /> Approve
                      </button>
                      <button
                        onClick={() => handleApproval(activeTurn.approval!.id, 'rejected')}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] font-semibold text-[10px] transition-all"
                      >
                        <X size={11} /> Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Form input */}
          <form onSubmit={handleSend} className="p-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
            <div className="flex gap-2 relative items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Codex to modify or write code..."
                disabled={session.state !== 'running' || activeTurn?.status === 'running'}
                className="flex-1 min-h-10 text-xs px-3.5 bg-[var(--color-bg-base)] border border-[var(--color-border-default)] rounded-xl focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50 text-[var(--color-text-primary)]"
              />
              
              {activeTurn?.status === 'running' ? (
                <button
                  type="button"
                  onClick={handleInterrupt}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors"
                  title="Stop Codex response"
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || sending || session.state !== 'running'}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 text-white disabled:opacity-40 transition-opacity"
                  title="Send message"
                >
                  <Send size={13} />
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Git Diffs Workspace Panel (Right) */}
        <div className="hidden lg:flex w-[45%] flex-col bg-[var(--color-bg-base)]">
          {/* File diff selector bar */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-4 bg-[var(--color-bg-base)]/80 backdrop-blur-md">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
              <Code size={13} /> Diffs
            </span>
            {gitFiles.length > 0 && (
              <select
                value={selectedDiffPath || ''}
                onChange={(e) => setSelectedDiffPath(e.target.value || null)}
                className="text-[11px] bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded-md px-2 py-1 max-w-[200px] outline-none"
              >
                {gitFiles.map((file) => (
                  <option key={file.path} value={file.path}>
                    {file.path.split('/').pop()} ({file.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex-1 min-h-0 relative">
            {gitFiles.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <span className="text-xs text-[var(--color-text-muted)]">No modified files detected in project</span>
              </div>
            ) : selectedDiffPath ? (
              <MonacoDiffPanel
                tabId={`diff-${selectedDiffPath}`}
                projectId={session.projectId}
                path={selectedDiffPath}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <span className="text-xs text-[var(--color-text-muted)]">Select a file to inspect differences</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
