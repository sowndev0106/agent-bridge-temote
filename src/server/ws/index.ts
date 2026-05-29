import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage, Server } from 'http'
import { verifySession } from '../core/auth.js'
import type { WsEvent, TerminalClientEvent } from '../../types.js'
import type { SessionManager } from '../sessions/manager.js'
import type { TerminalManager } from '../terminals/manager.js'

interface WsContext {
  sessionManager: SessionManager
  terminalManager: TerminalManager
}

export function createWsServer(httpServer: Server, sessionSecret: string, ctx?: WsContext) {
  console.log('[Server WS] Initializing WebSocket Server...')
  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set<WebSocket>()
  // Track which terminals each client is listening to (for targeted data routing)
  const clientTerminals = new Map<WebSocket, Set<string>>()
  // Track raw data unsubscribers for session attach
  const sessionDetachers = new Map<string, () => void>()

  // Auth on upgrade
  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    if (!request.url?.startsWith('/ws')) { socket.destroy(); return }
    console.log('[Server WS] Received upgrade request for /ws')
    const cookieHeader = request.headers.cookie ?? ''
    const match = cookieHeader.match(/rb_session=([^;]+)/)
    const token = match?.[1]
    if (!token || !verifySession(token, sessionSecret)) {
      console.warn('[Server WS] Upgrade rejected: Unauthorized session token')
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    console.log('[Server WS] Session token verified, upgrading connection...')
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws)
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    console.log('[Server WS] Client connected successfully')
    clients.add(ws)
    clientTerminals.set(ws, new Set())

    ws.on('message', (raw) => {
      console.log('[Server WS] Received raw client message:', raw.toString())
      if (!ctx) {
        console.warn('[Server WS] Context (ctx) is missing, ignoring message')
        return
      }
      try {
        const msg = JSON.parse(raw.toString()) as TerminalClientEvent
        console.log('[Server WS] Parsed client event type:', msg.type)
        handleTerminalMessage(ws, msg, ctx)
      } catch (err) {
        console.error('[Server WS] Failed to parse message:', err)
      }
    })

    ws.on('close', () => {
      console.log('[Server WS] Client disconnected')
      clients.delete(ws)
      clientTerminals.delete(ws)
    })
  })

  function handleTerminalMessage(ws: WebSocket, msg: TerminalClientEvent, ctx: WsContext) {
    console.log('[Server WS] handleTerminalMessage routing type:', msg.type, 'payload:', msg.payload)
    switch (msg.type) {
      case 'terminal.create': {
        console.log('[Server WS] Spawning new standalone terminal PTY')
        const info = ctx.terminalManager.create(msg.payload.cwd)
        const termIds = clientTerminals.get(ws)
        termIds?.add(info.id)
        const response: WsEvent = {
          type: 'terminal.created',
          payload: { terminalId: info.id, title: info.title, pid: info.pid, projectId: msg.payload.projectId ?? null }
        }
        console.log('[Server WS] Standalone terminal created:', info.id, 'sending response')
        ws.send(JSON.stringify(response))
        break
      }

      case 'terminal.input': {
        const { terminalId, data } = msg.payload
        console.log('[Server WS] Processing terminal.input for id:', terminalId, 'length:', data.length)
        if (ctx.terminalManager.has(terminalId)) {
          ctx.terminalManager.write(terminalId, data)
        } else {
          ctx.sessionManager.writeToSession(terminalId, data)
        }
        break
      }

      case 'terminal.resize': {
        const { terminalId, cols, rows } = msg.payload
        console.log('[Server WS] Processing terminal.resize for id:', terminalId, 'cols:', cols, 'rows:', rows)
        if (ctx.terminalManager.has(terminalId)) {
          ctx.terminalManager.resize(terminalId, cols, rows)
        } else {
          ctx.sessionManager.resizeSession(terminalId, cols, rows)
        }
        break
      }

      case 'terminal.close': {
        const { terminalId } = msg.payload
        console.log('[Server WS] Closing terminal:', terminalId)
        ctx.terminalManager.close(terminalId)
        clientTerminals.get(ws)?.delete(terminalId)
        break
      }

      case 'terminal.attach': {
        const { sessionId } = msg.payload
        console.log('[Server WS] Attaching client to session PTY:', sessionId)
        const termIds = clientTerminals.get(ws)
        termIds?.add(sessionId)

        // Clean up previous attachment if exists
        const prevDetach = sessionDetachers.get(sessionId)
        if (prevDetach) {
          console.log('[Server WS] Removing prior raw data listener for session:', sessionId)
          prevDetach()
        }

        console.log('[Server WS] Subscribing client to raw PTY data stream...')
        const detach = ctx.sessionManager.onRawData(sessionId, (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'terminal.data',
              payload: { terminalId: sessionId, data }
            }))
          }
        })
        sessionDetachers.set(sessionId, detach)

        const response: WsEvent = {
          type: 'terminal.attached',
          payload: { terminalId: sessionId, sessionId }
        }
        console.log('[Server WS] Attached successfully. Sending terminal.attached acknowledgement.')
        ws.send(JSON.stringify(response))
        break
      }
    }
  }

  function broadcast(event: WsEvent) {
    const msg = JSON.stringify(event)
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg)
    }
  }

  // Send terminal data only to relevant clients
  function sendToTerminalClients(terminalId: string, event: WsEvent) {
    const msg = JSON.stringify(event)
    for (const [client, termIds] of clientTerminals) {
      if (termIds.has(terminalId) && client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    }
  }

  return { broadcast, sendToTerminalClients }
}
