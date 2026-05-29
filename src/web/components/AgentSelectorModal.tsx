import { useEffect, useState } from 'react'
import { useUIStore } from '../stores/ui'
import { useSessionsStore } from '../stores/sessions'
import { api } from '../lib/api'
import type { AgentDefinition } from '../../types'

export default function AgentSelectorModal() {
  const { agentSelectorProjectId, setAgentSelectorProjectId } = useUIStore()
  const { addSession } = useSessionsStore()
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [selected, setSelected] = useState<string>('claude')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getAgents().then(setAgents).catch(() => {})
  }, [])

  if (!agentSelectorProjectId) return null

  const launch = async () => {
    setLoading(true)
    try {
      const session = await api.launchSession(agentSelectorProjectId, selected)
      addSession(session)
      setAgentSelectorProjectId(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setAgentSelectorProjectId(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Launch Agent"
        className="rb-safe-bottom max-h-[100dvh] w-full overflow-hidden rounded-t-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-modal)] sm:max-w-md sm:rounded-[var(--radius-xl)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Launch Agent</h2>
          <button type="button" onClick={() => setAgentSelectorProjectId(null)} className="rb-icon-button" aria-label="Close launch agent" title="Close">x</button>
        </div>
        <div className="rb-scrollbar max-h-[calc(100dvh-128px)] space-y-2 overflow-y-auto p-4 sm:max-h-[60dvh]">
          {agents.map(agent => (
            <label key={agent.id} className={`flex min-w-0 items-start gap-3 rounded-[var(--radius-lg)] border p-3 transition-colors
              ${selected === agent.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-glow)]' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]'}
              ${!agent.enabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name="agent"
                value={agent.id}
                checked={selected === agent.id}
                disabled={!agent.enabled}
                onChange={() => setSelected(agent.id)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">
                  {agent.name} {!agent.enabled && <span className="text-xs text-[var(--color-text-muted)]">(Phase 2)</span>}
                </span>
                <span className="rb-mono block truncate text-[11px] text-[var(--color-text-muted)]">{agent.command} {agent.args.join(' ')}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border-subtle)] p-4">
          <button type="button" onClick={() => setAgentSelectorProjectId(null)} className="rb-ghost-button">
            Cancel
          </button>
          <button type="button" onClick={launch} disabled={loading} className="rb-primary-button disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? 'Launching...' : 'Launch'}
          </button>
        </div>
      </div>
    </div>
  )
}
