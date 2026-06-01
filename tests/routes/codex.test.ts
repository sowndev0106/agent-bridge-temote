import { describe, expect, test, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { sessionRoutes } from '../../src/server/routes/sessions.js'

describe('Codex REST Routes', () => {
  let server: any
  let manager: any
  let mockAdapter: any

  beforeEach(async () => {
    server = Fastify()
    mockAdapter = {
      sendMessage: vi.fn(),
      resolveApproval: vi.fn()
    }
    manager = {
      getSession: vi.fn().mockReturnValue({
        id: 'session_1',
        agentId: 'codex',
        state: 'running'
      }),
      listSessions: vi.fn().mockReturnValue([]),
      updateSession: vi.fn()
    }

    // Bind getAdapter on manager directly
    manager.getAdapter = vi.fn().mockReturnValue(mockAdapter)

    await server.register(async (f) => {
      await sessionRoutes(f, manager)
    })
  })

  test('POST /api/sessions/:id/messages invokes sendMessage on adapter', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/sessions/session_1/messages',
      payload: { input: 'hello' }
    })

    expect(res.statusCode).toBe(200)
    expect(mockAdapter.sendMessage).toHaveBeenCalledWith('session_1', 'hello')
  })
})
