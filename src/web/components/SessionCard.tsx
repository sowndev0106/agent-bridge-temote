import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useProjectsStore } from '../stores/projects'
import { useUIStore } from '../stores/ui'
import type { Session } from '../../types'

const STATE_COLORS = {
  launching: 'text-yellow-400',
  running: 'text-green-400',
  stopped: 'text-gray-500',
  failed: 'text-red-400'
} as const

const STATE_ICONS = { launching: '◌', running: '●', stopped: '○', failed: '⚠' }

export default function SessionCard({ session }: { session: Session }) {
  const { updateSession, removeSession } = useSessionsStore()
  const { projects } = useProjectsStore()
  const { setLogsSessionId } = useUIStore()

  // Show the project's display name, not its raw UUID. Falls back to the id if the
  // project was deleted (H15 blocks delete for live sessions, but a stopped session's
  // project can be removed).
  const projectName = projects.find(p => p.id === session.projectId)?.name ?? session.projectId

  const stop = async () => {
    const updated = await api.stopSession(session.id)
    updateSession(session.id, updated)
  }

  const restart = async () => {
    const updated = await api.restartSession(session.id)
    updateSession(session.id, updated)
  }

  const remove = async () => {
    await api.deleteSession(session.id)
    removeSession(session.id)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium text-white text-sm">{projectName}</p>
          <p className="text-xs text-gray-500">{session.agentId}</p>
        </div>
        <span className={`text-xs font-mono ${STATE_COLORS[session.state]}`}>
          {STATE_ICONS[session.state]} {session.state.charAt(0).toUpperCase() + session.state.slice(1)}
        </span>
      </div>

      {session.state === 'launching' && (
        <div className="w-full bg-gray-800 rounded-full h-1">
          <div className="bg-yellow-400 h-1 rounded-full animate-pulse w-1/2" />
        </div>
      )}

      {session.state === 'running' && session.remoteLink && (
        <a
          href={session.remoteLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
        >
          Open Remote Control ↗
        </a>
      )}

      {session.state === 'failed' && (
        <p className="text-xs text-red-400">{session.error ?? 'Unknown error'}</p>
      )}

      <div className="flex gap-2">
        {session.state === 'running' && (
          <button onClick={stop} className="flex-1 text-xs py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300">
            ■ Stop
          </button>
        )}
        {(session.state === 'stopped' || session.state === 'failed') && (
          <>
            <button onClick={restart} className="flex-1 text-xs py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300">
              ↺ Restart
            </button>
            <button onClick={remove} className="text-xs py-1.5 px-3 bg-gray-800 hover:bg-red-900/40 rounded-lg text-red-400">
              ✕
            </button>
          </>
        )}
        <button
          onClick={() => setLogsSessionId(session.id)}
          className="text-xs py-1.5 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400"
        >
          Logs
        </button>
      </div>
    </div>
  )
}
