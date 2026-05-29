import { useRef, useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { useSessionsStore } from '../stores/sessions'
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'

export default function LogsDrawer() {
  const { logsSessionId, setLogsSessionId } = useUIStore()
  const { sessions } = useSessionsStore()
  const { addTab, tabs } = useTerminalsStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const session = sessions.find(s => s.id === logsSessionId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.logs.length])

  const openInTerminal = () => {
    console.log('[LogsDrawer] openInTerminal clicked, session:', session?.id)
    if (!session) {
      console.warn('[LogsDrawer] No active session found in drawer')
      return
    }
    // Check if already attached
    const existing = tabs.find(t => t.sessionId === session.id)
    console.log('[LogsDrawer] existing terminal tab found:', existing)
    if (existing) {
      console.log('[LogsDrawer] Switching to existing terminal tab:', existing.id)
      useTerminalsStore.getState().setActiveTab(existing.id)
      useTerminalsStore.getState().setPanelOpen(true)
      setLogsSessionId(null)
      return
    }
    // Attach to session PTY
    console.log('[LogsDrawer] Sending terminal.attach event to WS for session:', session.id)
    sendWsMessage({ type: 'terminal.attach', payload: { sessionId: session.id } })
    console.log('[LogsDrawer] Adding session tab to terminals store')
    addTab({
      id: session.id,
      title: `${session.agentId} session`,
      type: 'session',
      sessionId: session.id
    })
    setLogsSessionId(null)  // close drawer
  }

  if (!logsSessionId) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setLogsSessionId(null)}>
      <div className="bg-gray-900 w-full max-w-xl h-full flex flex-col shadow-2xl border-l border-gray-800" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Logs — {session?.agentId ?? logsSessionId}</h2>
          <div className="flex items-center gap-3">
            {session && (session.state === 'launching' || session.state === 'running') && (
              <button
                onClick={openInTerminal}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <span>⚡</span>
                <span>Open Terminal</span>
              </button>
            )}
            <button onClick={() => setLogsSessionId(null)} className="text-gray-500 hover:text-white text-lg font-bold leading-none">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-gray-300 space-y-0.5">
          {session?.logs.map((line, i) => (
            <p key={i} className={line.match(/https?:\/\//) ? 'text-blue-400 font-semibold' : ''}>{line}</p>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
