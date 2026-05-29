import { useEffect, useRef } from 'react'
import { useSessionsStore } from '../stores/sessions'
import { useConfigStore } from '../stores/config'
import { useTerminalsStore } from '../stores/terminals'
import type { WsEvent, TerminalClientEvent } from '../../types'

// Singleton WebSocket reference for sending messages from anywhere
let globalWs: WebSocket | null = null

export function getWs(): WebSocket | null {
  return globalWs
}

export function sendWsMessage(msg: TerminalClientEvent): void {
  console.log('[WebSocket Client] sendWsMessage called:', msg, 'ws:', globalWs, 'readyState:', globalWs?.readyState)
  if (globalWs && (globalWs.readyState === 1 || globalWs.readyState === (window as any).WebSocket?.OPEN)) {
    globalWs.send(JSON.stringify(msg))
  } else {
    console.warn('[WebSocket Client] sendWsMessage dropped: WebSocket is not open or not initialized.')
  }
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { updateSession, appendLog } = useSessionsStore()
  const { setWsConnected } = useConfigStore()
  const { addTab, removeTab } = useTerminalsStore()

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`

    let closed = false

    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws
      globalWs = ws

      ws.onopen = () => {
        if (globalWs === ws) {
          setWsConnected(true)
        }
      }
      ws.onclose = () => {
        if (globalWs === ws) {
          setWsConnected(false)
          globalWs = null
        }
        if (!closed) setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsEvent
          switch (msg.type) {
            case 'session.updated':
              updateSession(msg.payload.id, msg.payload as Parameters<typeof updateSession>[1])
              break
            case 'session.log': {
              const { sessionId, line } = msg.payload
              appendLog(sessionId, line)
              break
            }
            case 'terminal.data': {
              // Handled by individual xterm instances via event listener
              const evt = new CustomEvent('terminal-data', { detail: msg.payload })
              window.dispatchEvent(evt)
              break
            }
            case 'terminal.created': {
              addTab({
                id: msg.payload.terminalId,
                title: msg.payload.title,
                type: 'standalone',
                pid: msg.payload.pid,
                projectId: msg.payload.projectId ?? null
              })
              break
            }
            case 'terminal.closed': {
              removeTab(msg.payload.terminalId)
              break
            }
            case 'terminal.attached': {
              // Handled at call site via dispatch or store action
              break
            }
          }
        } catch { /* ignore malformed */ }
      }
    }

    connect()
    return () => {
      closed = true
      const activeWs = wsRef.current
      if (globalWs === activeWs) {
        globalWs = null
      }
      activeWs?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
