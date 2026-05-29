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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAgentSelectorProjectId(null)}>
      <div className="bg-gray-900 rounded-xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-white">Launch Agent</h2>
          <button onClick={() => setAgentSelectorProjectId(null)} className="text-gray-500 hover:text-white">×</button>
        </div>
        <div className="space-y-2 mb-4">
          {agents.map(agent => (
            <label key={agent.id} className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors
              ${selected === agent.id ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600'}
              ${!agent.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="agent"
                value={agent.id}
                checked={selected === agent.id}
                disabled={!agent.enabled}
                onChange={() => setSelected(agent.id)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-white">{agent.name} {!agent.enabled && <span className="text-xs text-gray-500">(Phase 2)</span>}</p>
                <p className="text-xs text-gray-500">{agent.command} {agent.args.join(' ')}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAgentSelectorProjectId(null)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
            Cancel
          </button>
          <button onClick={launch} disabled={loading} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Launching…' : '▶ Launch'}
          </button>
        </div>
      </div>
    </div>
  )
}
