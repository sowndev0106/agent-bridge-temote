import { Readable, Writable } from 'stream'

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: any
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: any
}

export class CodexAppServerClient {
  private idSeq = 0
  private pending = new Map<number, { resolve: (res: any) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>()
  private notificationListeners = new Set<(notification: JsonRpcNotification) => void>()
  private buffer = ''

  constructor(private inbound: Readable, private outbound: Writable) {
    this.inbound.on('data', (chunk: Buffer | string) => {
      this.buffer += chunk.toString()
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) {
          this.handleLine(trimmed)
        }
      }
    })
  }

  private handleLine(line: string) {
    try {
      const msg = JSON.parse(line)
      if (msg.jsonrpc !== '2.0') return

      if ('id' in msg && msg.id !== null && msg.id !== undefined) {
        // Response
        const pendingReq = this.pending.get(Number(msg.id))
        if (pendingReq) {
          clearTimeout(pendingReq.timeout)
          this.pending.delete(Number(msg.id))
          if ('error' in msg && msg.error) {
            pendingReq.reject(new Error(msg.error.message || `JSON-RPC error ${msg.error.code}`))
          } else {
            pendingReq.resolve(msg.result)
          }
        }
      } else if ('method' in msg) {
        // Notification
        for (const listener of this.notificationListeners) {
          try {
            listener(msg)
          } catch (err) {
            console.error('[CodexAppServerClient] Listener error:', err)
          }
        }
      }
    } catch (e) {
      console.error('[CodexAppServerClient] Malformed line:', line, e)
    }
  }

  async sendRequest(method: string, params?: any, timeoutMs = 30000): Promise<any> {
    const id = ++this.idSeq
    const req: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request ${method} (id: ${id}) timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeout })
      this.outbound.write(JSON.stringify(req) + '\n')
    })
  }

  onNotification(listener: (notification: JsonRpcNotification) => void): () => void {
    this.notificationListeners.add(listener)
    return () => {
      this.notificationListeners.delete(listener)
    }
  }

  destroy() {
    for (const pendingReq of this.pending.values()) {
      clearTimeout(pendingReq.timeout)
      pendingReq.reject(new Error('Client destroyed'))
    }
    this.pending.clear()
    this.notificationListeners.clear()
  }
}
