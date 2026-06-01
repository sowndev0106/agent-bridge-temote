import { describe, expect, test } from 'vitest'

type UiEvent =
  | { type: 'session.started'; sessionId: string; threadId: string }
  | { type: 'turn.started'; sessionId: string; threadId: string; turnId: string }
  | { type: 'message.delta'; sessionId: string; threadId: string; turnId: string; delta: string }
  | { type: 'approval.requested'; sessionId: string; threadId: string; approvalId: string; command: string }
  | { type: 'approval.resolved'; sessionId: string; threadId: string; approvalId: string; decision: 'approved' | 'rejected' }
  | { type: 'turn.completed'; sessionId: string; threadId: string; turnId: string; status: 'completed' | 'interrupted' }

type CodexNotification =
  | { method: 'turn/started'; params: { threadId: string; turnId: string } }
  | { method: 'item/agentMessage/delta'; params: { threadId: string; turnId: string; delta: string } }
  | { method: 'turn/completed'; params: { threadId: string; turnId: string; status: 'completed' | 'interrupted' } }

type ApprovalRequest = {
  approvalId: string
  threadId: string
  turnId: string
  command: string
}

type ApprovalDecision = 'approved' | 'rejected'

type ThreadRecord = {
  id: string
  cwd: string
  turnIds: string[]
  interruptedTurnIds: Set<string>
}

class MockCodexAppServer {
  private initialized = false
  private threadSeq = 0
  private turnSeq = 0
  private approvalSeq = 0
  private readonly threads = new Map<string, ThreadRecord>()
  private readonly notificationHandlers = new Set<(notification: CodexNotification) => void>()
  private approvalHandler?: (request: ApprovalRequest) => Promise<ApprovalDecision>

  onNotification(handler: (notification: CodexNotification) => void) {
    this.notificationHandlers.add(handler)
  }

  onApprovalRequest(handler: (request: ApprovalRequest) => Promise<ApprovalDecision>) {
    this.approvalHandler = handler
  }

  async request(method: string, params: Record<string, unknown> = {}) {
    if (method === 'initialize') {
      this.initialized = true
      return { codexHome: '/tmp/mock-codex-home', protocolVersion: 2 }
    }

    if (!this.initialized) {
      throw new Error('not_initialized')
    }

    if (method === 'thread/start') {
      const cwd = String(params.cwd)
      const thread: ThreadRecord = {
        id: `thread_${++this.threadSeq}`,
        cwd,
        turnIds: [],
        interruptedTurnIds: new Set()
      }
      this.threads.set(thread.id, thread)
      return { thread }
    }

    if (method === 'thread/resume') {
      const threadId = String(params.threadId)
      const thread = this.getThread(threadId)
      return { thread }
    }

    if (method === 'turn/start') {
      const threadId = String(params.threadId)
      const input = String(params.input)
      const thread = this.getThread(threadId)
      const turnId = `turn_${++this.turnSeq}`
      thread.turnIds.push(turnId)
      void this.runTurn(threadId, turnId, input)
      return { turn: { id: turnId, threadId, status: 'running' } }
    }

    if (method === 'turn/interrupt') {
      const threadId = String(params.threadId)
      const turnId = String(params.turnId)
      const thread = this.getThread(threadId)
      thread.interruptedTurnIds.add(turnId)
      return {}
    }

    throw new Error(`unsupported_method:${method}`)
  }

  getThreadForAssertion(threadId: string) {
    return this.getThread(threadId)
  }

  private getThread(threadId: string) {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`unknown_thread:${threadId}`)
    }
    return thread
  }

  private async runTurn(threadId: string, turnId: string, input: string) {
    const thread = this.getThread(threadId)
    this.notify({ method: 'turn/started', params: { threadId, turnId } })
    this.notify({
      method: 'item/agentMessage/delta',
      params: { threadId, turnId, delta: `received:${input}` }
    })

    if (input.includes('needs approval')) {
      const decision = await this.requestApproval({
        approvalId: `approval_${++this.approvalSeq}`,
        threadId,
        turnId,
        command: 'npm test'
      })
      this.notify({
        method: 'item/agentMessage/delta',
        params: { threadId, turnId, delta: `approval:${decision}` }
      })
    }

    await Promise.resolve()
    const status = thread.interruptedTurnIds.has(turnId) ? 'interrupted' : 'completed'
    this.notify({ method: 'turn/completed', params: { threadId, turnId, status } })
  }

  private async requestApproval(request: ApprovalRequest) {
    if (!this.approvalHandler) {
      throw new Error('approval_handler_missing')
    }
    return this.approvalHandler(request)
  }

  private notify(notification: CodexNotification) {
    for (const handler of this.notificationHandlers) {
      handler(notification)
    }
  }
}

class MockRemoteBridgeCodexGateway {
  private initialized = false
  private readonly sessions = new Map<string, string>()
  private readonly threadSessions = new Map<string, string>()
  private readonly events: UiEvent[] = []
  private readonly waiters: Array<{ predicate: (event: UiEvent) => boolean; resolve: (event: UiEvent) => void }> = []
  private readonly pendingApprovals = new Map<string, (decision: ApprovalDecision) => void>()

  constructor(private readonly codex: MockCodexAppServer) {
    this.codex.onNotification((notification) => this.mapNotification(notification))
    this.codex.onApprovalRequest((request) => this.mapApprovalRequest(request))
  }

  async startSession(sessionId: string, cwd: string) {
    await this.ensureInitialized()
    const result = (await this.codex.request('thread/start', { cwd })) as {
      thread: { id: string }
    }
    this.sessions.set(sessionId, result.thread.id)
    this.threadSessions.set(result.thread.id, sessionId)
    this.push({ type: 'session.started', sessionId, threadId: result.thread.id })
    return { sessionId, threadId: result.thread.id }
  }

  async resumeSession(sessionId: string) {
    await this.ensureInitialized()
    const threadId = this.sessions.get(sessionId)
    if (!threadId) {
      throw new Error(`unknown_session:${sessionId}`)
    }
    await this.codex.request('thread/resume', { threadId })
    return { sessionId, threadId }
  }

  async sendMessage(sessionId: string, input: string) {
    const threadId = this.requireThreadId(sessionId)
    const result = (await this.codex.request('turn/start', { threadId, input })) as {
      turn: { id: string }
    }
    return { sessionId, threadId, turnId: result.turn.id }
  }

  async interrupt(sessionId: string, turnId: string) {
    const threadId = this.requireThreadId(sessionId)
    await this.codex.request('turn/interrupt', { threadId, turnId })
  }

  approve(approvalId: string, decision: ApprovalDecision) {
    const resolve = this.pendingApprovals.get(approvalId)
    if (!resolve) {
      throw new Error(`unknown_approval:${approvalId}`)
    }
    this.pendingApprovals.delete(approvalId)
    resolve(decision)
  }

  waitFor(predicate: (event: UiEvent) => boolean) {
    const existing = this.events.find(predicate)
    if (existing) {
      return Promise.resolve(existing)
    }
    return new Promise<UiEvent>((resolve) => {
      this.waiters.push({ predicate, resolve })
    })
  }

  getEvents() {
    return [...this.events]
  }

  private async ensureInitialized() {
    if (this.initialized) {
      return
    }
    await this.codex.request('initialize', {
      clientInfo: { name: 'remotebridge_mock', version: '0.0.0-test' }
    })
    this.initialized = true
  }

  private requireThreadId(sessionId: string) {
    const threadId = this.sessions.get(sessionId)
    if (!threadId) {
      throw new Error(`unknown_session:${sessionId}`)
    }
    return threadId
  }

  private mapNotification(notification: CodexNotification) {
    const sessionId = this.threadSessions.get(notification.params.threadId)
    if (!sessionId) {
      return
    }

    if (notification.method === 'turn/started') {
      this.push({ type: 'turn.started', sessionId, ...notification.params })
      return
    }

    if (notification.method === 'item/agentMessage/delta') {
      this.push({ type: 'message.delta', sessionId, ...notification.params })
      return
    }

    this.push({ type: 'turn.completed', sessionId, ...notification.params })
  }

  private mapApprovalRequest(request: ApprovalRequest) {
    const sessionId = this.threadSessions.get(request.threadId)
    if (!sessionId) {
      throw new Error(`unknown_thread:${request.threadId}`)
    }

    this.push({
      type: 'approval.requested',
      sessionId,
      threadId: request.threadId,
      approvalId: request.approvalId,
      command: request.command
    })

    return new Promise<ApprovalDecision>((resolve) => {
      this.pendingApprovals.set(request.approvalId, (decision) => {
        this.push({
          type: 'approval.resolved',
          sessionId,
          threadId: request.threadId,
          approvalId: request.approvalId,
          decision
        })
        resolve(decision)
      })
    })
  }

  private push(event: UiEvent) {
    this.events.push(event)
    for (const waiter of [...this.waiters]) {
      if (waiter.predicate(event)) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        waiter.resolve(event)
      }
    }
  }
}

describe('Codex remote UI mock contract', () => {
  test('maps a RemoteBridge session to one Codex thread and streams a turn to completion', async () => {
    const codex = new MockCodexAppServer()
    const gateway = new MockRemoteBridgeCodexGateway(codex)

    const session = await gateway.startSession('rb_session_1', '/workspace/app')
    const turn = await gateway.sendMessage(session.sessionId, 'fix the failing tests')
    const completed = await gateway.waitFor((event) => event.type === 'turn.completed' && event.turnId === turn.turnId)

    expect(session.threadId).toBe('thread_1')
    expect(turn.threadId).toBe(session.threadId)
    expect(completed).toMatchObject({
      type: 'turn.completed',
      sessionId: 'rb_session_1',
      threadId: 'thread_1',
      turnId: 'turn_1',
      status: 'completed'
    })
    expect(codex.getThreadForAssertion(session.threadId).cwd).toBe('/workspace/app')
    expect(gateway.getEvents().map((event) => event.type)).toEqual([
      'session.started',
      'turn.started',
      'message.delta',
      'turn.completed'
    ])
  })

  test('resumes the same Codex thread after a UI reconnect', async () => {
    const codex = new MockCodexAppServer()
    const gateway = new MockRemoteBridgeCodexGateway(codex)

    const session = await gateway.startSession('rb_session_1', '/workspace/app')
    await gateway.sendMessage('rb_session_1', 'first message')
    await gateway.waitFor((event) => event.type === 'turn.completed' && event.turnId === 'turn_1')

    const resumed = await gateway.resumeSession('rb_session_1')
    const nextTurn = await gateway.sendMessage('rb_session_1', 'second message')
    await gateway.waitFor((event) => event.type === 'turn.completed' && event.turnId === nextTurn.turnId)

    expect(resumed.threadId).toBe(session.threadId)
    expect(nextTurn.threadId).toBe(session.threadId)
    expect(codex.getThreadForAssertion(session.threadId).turnIds).toEqual(['turn_1', 'turn_2'])
  })

  test('round-trips Codex approval requests through the web UI event layer', async () => {
    const codex = new MockCodexAppServer()
    const gateway = new MockRemoteBridgeCodexGateway(codex)

    await gateway.startSession('rb_session_1', '/workspace/app')
    const turn = await gateway.sendMessage('rb_session_1', 'needs approval before running tests')
    const approval = await gateway.waitFor((event) => event.type === 'approval.requested')

    expect(approval).toMatchObject({
      type: 'approval.requested',
      sessionId: 'rb_session_1',
      threadId: 'thread_1',
      approvalId: 'approval_1',
      command: 'npm test'
    })

    gateway.approve('approval_1', 'approved')
    const completed = await gateway.waitFor((event) => event.type === 'turn.completed' && event.turnId === turn.turnId)

    expect(completed).toMatchObject({ status: 'completed' })
    expect(gateway.getEvents().map((event) => event.type)).toContain('approval.resolved')
    expect(
      gateway.getEvents().some((event) => event.type === 'message.delta' && event.delta === 'approval:approved')
    ).toBe(true)
  })

  test('interrupts a running Codex turn and keeps the session mapped to the same thread', async () => {
    const codex = new MockCodexAppServer()
    const gateway = new MockRemoteBridgeCodexGateway(codex)

    const session = await gateway.startSession('rb_session_1', '/workspace/app')
    const turn = await gateway.sendMessage('rb_session_1', 'needs approval during a long task')
    await gateway.waitFor((event) => event.type === 'approval.requested')

    await gateway.interrupt('rb_session_1', turn.turnId)
    gateway.approve('approval_1', 'rejected')
    const completed = await gateway.waitFor((event) => event.type === 'turn.completed' && event.turnId === turn.turnId)

    expect(completed).toMatchObject({
      type: 'turn.completed',
      sessionId: 'rb_session_1',
      threadId: session.threadId,
      turnId: turn.turnId,
      status: 'interrupted'
    })
    expect(gateway.getEvents().filter((event) => event.type === 'session.started')).toHaveLength(1)
  })

  test('keeps concurrent web sessions mapped to separate Codex threads without cross-talk', async () => {
    const codex = new MockCodexAppServer()
    const gateway = new MockRemoteBridgeCodexGateway(codex)

    const alpha = await gateway.startSession('rb_session_alpha', '/workspace/alpha')
    const beta = await gateway.startSession('rb_session_beta', '/workspace/beta')

    const alphaTurn = await gateway.sendMessage(alpha.sessionId, 'alpha task')
    const betaTurn = await gateway.sendMessage(beta.sessionId, 'beta task')

    await gateway.waitFor((event) => event.type === 'turn.completed' && event.turnId === alphaTurn.turnId)
    await gateway.waitFor((event) => event.type === 'turn.completed' && event.turnId === betaTurn.turnId)

    const alphaEvents = gateway.getEvents().filter((event) => event.sessionId === alpha.sessionId)
    const betaEvents = gateway.getEvents().filter((event) => event.sessionId === beta.sessionId)

    expect(alpha.threadId).toBe('thread_1')
    expect(beta.threadId).toBe('thread_2')
    expect(alphaEvents.every((event) => event.threadId === alpha.threadId)).toBe(true)
    expect(betaEvents.every((event) => event.threadId === beta.threadId)).toBe(true)
    expect(
      alphaEvents.some((event) => event.type === 'message.delta' && event.delta === 'received:alpha task')
    ).toBe(true)
    expect(betaEvents.some((event) => event.type === 'message.delta' && event.delta === 'received:beta task')).toBe(
      true
    )
    expect(codex.getThreadForAssertion(alpha.threadId).cwd).toBe('/workspace/alpha')
    expect(codex.getThreadForAssertion(beta.threadId).cwd).toBe('/workspace/beta')
  })
})
