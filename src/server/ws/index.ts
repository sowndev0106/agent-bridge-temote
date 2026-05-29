import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage, Server } from 'http'
import { verifySession } from '../core/auth.js'
import type { WsEvent } from '../../types.js'

export function createWsServer(httpServer: Server, sessionSecret: string) {
  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set<WebSocket>()

  // Auth on upgrade
  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    if (!request.url?.startsWith('/ws')) { socket.destroy(); return }
    const cookieHeader = request.headers.cookie ?? ''
    const match = cookieHeader.match(/rb_session=([^;]+)/)
    const token = match?.[1]
    if (!token || !verifySession(token, sessionSecret)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws)
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
  })

  function broadcast(event: WsEvent) {
    const msg = JSON.stringify(event)
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg)
    }
  }

  return { broadcast }
}
