import { useEffect, useRef } from 'react'
import { useSessionsStore } from '../stores/sessions'
import { useConfigStore } from '../stores/config'
import type { WsEvent } from '../../types'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { updateSession, appendLog } = useSessionsStore()
  const { setWsConnected } = useConfigStore()

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`

    let closed = false

    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => setWsConnected(true)
      ws.onclose = () => {
        setWsConnected(false)
        if (!closed) setTimeout(connect, 3000) // auto-reconnect
      }
      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsEvent
          if (msg.type === 'session.updated') {
            updateSession(msg.payload.id, msg.payload as Parameters<typeof updateSession>[1])
          } else if (msg.type === 'session.log') {
            const { sessionId, line } = msg.payload
            appendLog(sessionId, line)
          }
        } catch { /* ignore malformed */ }
      }
    }

    connect()
    return () => { closed = true; wsRef.current?.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
