import { describe, expect, test, vi } from 'vitest'
import { CodexAppServerClient } from '../../src/server/sessions/codex-client.js'
import { Readable, Writable } from 'stream'

describe('CodexAppServerClient', () => {
  test('handles successful request and response pairing', async () => {
    const inbound = new Readable({ read() {} })
    let written = ''
    const outbound = new Writable({
      write(chunk, encoding, callback) {
        written += chunk.toString()
        callback()
      }
    })

    const client = new CodexAppServerClient(inbound, outbound)
    const requestPromise = client.sendRequest('thread/start', { cwd: '/workspace' })

    // Verify correct JSON-RPC request was written to outbound
    const parsedRequest = JSON.parse(written.trim())
    expect(parsedRequest).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'thread/start',
      params: { cwd: '/workspace' }
    })

    // Simulate response coming back in inbound
    inbound.push(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      result: { threadId: 'thread_abc' }
    }) + '\n')

    const result = await requestPromise
    expect(result).toEqual({ threadId: 'thread_abc' })
  })

  test('handles error responses', async () => {
    const inbound = new Readable({ read() {} })
    const outbound = new Writable({ write(chunk, enc, cb) { cb() } })

    const client = new CodexAppServerClient(inbound, outbound)
    const requestPromise = client.sendRequest('thread/start', { cwd: '/workspace' })

    // Simulate error response
    inbound.push(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32603, message: 'Internal error' }
    }) + '\n')

    await expect(requestPromise).rejects.toThrow('Internal error')
  })

  test('correctly invokes notification listeners', async () => {
    const inbound = new Readable({ read() {} })
    const outbound = new Writable({ write(chunk, enc, cb) { cb() } })

    const client = new CodexAppServerClient(inbound, outbound)
    const notifications: any[] = []
    client.onNotification((n) => notifications.push(n))

    inbound.push(JSON.stringify({
      jsonrpc: '2.0',
      method: 'turn/started',
      params: { threadId: 'thread_1', turnId: 'turn_1' }
    }) + '\n')

    // Wait for the stream event loop tick to process the push
    await new Promise(r => process.nextTick(r))

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toEqual({
      jsonrpc: '2.0',
      method: 'turn/started',
      params: { threadId: 'thread_1', turnId: 'turn_1' }
    })
  })

  test('times out hanging requests', async () => {
    const inbound = new Readable({ read() {} })
    const outbound = new Writable({ write(chunk, enc, cb) { cb() } })

    const client = new CodexAppServerClient(inbound, outbound)
    const requestPromise = client.sendRequest('thread/start', {}, 50)

    await expect(requestPromise).rejects.toThrow('timed out after 50ms')
  })
})
