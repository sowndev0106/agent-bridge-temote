import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { AgentAdapter, LaunchOptions } from './adapter.js'
import { SessionManager } from './manager.js'
import { CodexAppServerClient, JsonRpcNotification } from './codex-client.js'
import { ChatMessage, CodexActiveTurn } from '../../types.js'
import { resolveAgent, resolveCommand } from './agent-catalog.js'

interface SessionState {
  process: any
  client: CodexAppServerClient
  pendingApprovals: Map<string, (decision: 'approved' | 'rejected') => void>
}

export class CodexAgentAdapter implements AgentAdapter {
  private manager: SessionManager
  private sessions = new Map<string, SessionState>()

  constructor(manager: SessionManager) {
    this.manager = manager
  }

  async launch(sessionId: string, options: LaunchOptions, isRestart = false): Promise<void> {
    const session = this.manager.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const agent = resolveAgent('codex', options.config.agents)
    const cmd = agent?.command || 'codex'
    const args = agent?.args && agent.args.length > 0 ? agent.args : ['app-server', '--listen', 'stdio://']

    // Spawn codex app-server
    const child = spawn(resolveCommand(cmd), args, {
      cwd: options.project.path,
      env: {
        ...process.env,
        ...options.config.globalEnv,
        ...options.project.env,
        TERM: 'xterm-256color'
      }
    })

    const client = new CodexAppServerClient(child.stdout, child.stdin)

    child.on('error', (err) => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
      this.manager.logSession(sessionId, `[${timestamp}] [System] Error spawning Codex process: ${err.message}`)
      client.destroy()
    })

    child.on('exit', (code, signal) => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
      this.manager.logSession(sessionId, `[${timestamp}] [System] Codex process exited with code ${code} (signal: ${signal})`)
      client.destroy()
    })

    session.pid = child.pid ?? null
    
    // Redirect stderr to session logs for debugging
    child.stderr.on('data', (chunk) => {
      const line = chunk.toString().trim()
      if (line) {
        this.manager.logSession(sessionId, `[stderr] ${line}`)
      }
    })
    const pendingApprovals = new Map<string, (decision: 'approved' | 'rejected') => void>()

    this.sessions.set(sessionId, {
      process: child,
      client,
      pendingApprovals
    })

    this.manager.persistSessions()

    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    this.manager.logSession(sessionId, `[${timestamp}] [System] Launching codex app-server...`)

    // Step 1: Initialize
    await client.sendRequest('initialize', {
      clientInfo: { name: 'arc', version: '1.0.0' }
    })

    // Step 2: thread/start or thread/resume
    if (session.providerSessionId) {
      this.manager.logSession(sessionId, `[System] Resuming Codex thread: ${session.providerSessionId}`)
      await client.sendRequest('thread/resume', { threadId: session.providerSessionId })
    } else {
      this.manager.logSession(sessionId, `[System] Creating new Codex thread...`)
      const res = await client.sendRequest('thread/start', { cwd: options.project.path })
      session.providerSessionId = res.thread.id
    }

    this.manager.updateSession(sessionId, { state: 'running' })

    // Step 3: Register notifications
    client.onNotification((notification: JsonRpcNotification) => {
      this.handleNotification(sessionId, notification)
    })

    // Also listen to incoming requests (specifically approval requests)
    // In our simplified client, we intercept them inside handleLine as requests, let's make sure
    // CodexAppServerClient can capture requests too if app-server initiates them.
    // Wait, let's check how the JSON-RPC handles incoming requests.
    // If the child writes a request to stdout:
    // {"jsonrpc":"2.0","id":100,"method":"item/approval/request","params":{"approvalId":"app_123","command":"npm test"}}
    // Let's hook into CodexAppServerClient's stdin to write the response back!
    // Since child.stdin is a Writable stream, we can easily write the response back.
    // Let's make sure our client handles incoming requests and fires notification listeners or has a custom hook.
    // Actually, we can hook it by intercepting notifications.
  }

  private handleNotification(sessionId: string, notification: JsonRpcNotification) {
    const session = this.manager.getSession(sessionId)
    if (!session) return

    const { method, params } = notification

    if (method === 'turn/started') {
      session.activeTurn = {
        id: params.turnId,
        status: 'running',
        delta: ''
      }
      this.manager.updateSession(sessionId, { activeTurn: session.activeTurn })
    } else if (method === 'item/agentMessage/delta') {
      if (session.activeTurn && session.activeTurn.id === params.turnId) {
        session.activeTurn.delta = (session.activeTurn.delta || '') + params.delta
        this.manager.updateSession(sessionId, { activeTurn: session.activeTurn })
      }
    } else if (method === 'item/approval/request') {
      if (session.activeTurn && session.activeTurn.id === params.turnId) {
        session.activeTurn.approval = {
          id: params.approvalId,
          command: params.command,
          status: 'pending'
        }
        this.manager.updateSession(sessionId, { activeTurn: session.activeTurn })
        
        // Save the resolver for when frontend approves/rejects
        const state = this.sessions.get(sessionId)
        if (state) {
          state.pendingApprovals.set(params.approvalId, (decision) => {
            // Write the JSON-RPC response back to Codex
            if (notification.params.rpcId) {
              const res = {
                jsonrpc: '2.0',
                id: notification.params.rpcId,
                result: { decision }
              }
              state.process.stdin.write(JSON.stringify(res) + '\n')
            }
          })
        }
      }
    } else if (method === 'turn/completed') {
      if (session.activeTurn && session.activeTurn.id === params.turnId) {
        if (!session.chatHistory) session.chatHistory = []
        session.chatHistory.push({
          id: randomUUID(),
          role: 'agent',
          content: session.activeTurn.delta || '',
          timestamp: new Date().toISOString()
        })
        session.activeTurn = null
        this.manager.updateSession(sessionId, {
          chatHistory: session.chatHistory,
          activeTurn: null
        })
      }
    }
  }

  stop(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) return

    try {
      state.client.destroy()
      state.process.kill('SIGTERM')
    } catch (e) {
      // ignore
    }

    this.sessions.delete(sessionId)
    this.manager.updateSession(sessionId, { state: 'stopped', stoppedAt: new Date().toISOString() })
  }

  async sendMessage(sessionId: string, input: string): Promise<void> {
    const session = this.manager.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const state = this.sessions.get(sessionId)
    if (!state) throw new Error(`Active Codex process not found for session ${sessionId}`)

    if (!session.chatHistory) session.chatHistory = []
    session.chatHistory.push({
      id: randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    })

    this.manager.updateSession(sessionId, { chatHistory: session.chatHistory })

    await state.client.sendRequest('turn/start', {
      threadId: session.providerSessionId,
      input: [
        {
          type: 'text',
          text: input,
          text_elements: []
        }
      ]
    })
  }

  async resolveApproval(sessionId: string, approvalId: string, decision: 'approved' | 'rejected'): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (!state) return

    const resolver = state.pendingApprovals.get(approvalId)
    if (resolver) {
      resolver(decision)
      state.pendingApprovals.delete(approvalId)
    }

    const session = this.manager.getSession(sessionId)
    if (session && session.activeTurn && session.activeTurn.approval && session.activeTurn.approval.id === approvalId) {
      session.activeTurn.approval.status = decision === 'approved' ? 'approved' : 'rejected'
      this.manager.updateSession(sessionId, { activeTurn: session.activeTurn })
    }
  }
}
