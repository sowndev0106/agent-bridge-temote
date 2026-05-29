import { useRef, useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { useSessionsStore } from '../stores/sessions'

export default function LogsDrawer() {
  const { logsSessionId, setLogsSessionId } = useUIStore()
  const { sessions } = useSessionsStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const session = sessions.find(s => s.id === logsSessionId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.logs.length])

  if (!logsSessionId) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setLogsSessionId(null)}>
      <div className="bg-gray-900 w-full max-w-xl h-full flex flex-col shadow-2xl border-l border-gray-800" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Logs — {session?.agentId ?? logsSessionId}</h2>
          <button onClick={() => setLogsSessionId(null)} className="text-gray-500 hover:text-white">×</button>
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
