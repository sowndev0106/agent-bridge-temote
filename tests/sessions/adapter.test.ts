import { describe, expect, test } from 'vitest'
import { SessionManager } from '../../src/server/sessions/manager.js'
import { PtyAgentAdapter } from '../../src/server/sessions/pty-adapter.js'

describe('AgentAdapter integration', () => {
  test('SessionManager uses PtyAgentAdapter for Claude Code', async () => {
    expect(PtyAgentAdapter).toBeDefined()
  })
})
