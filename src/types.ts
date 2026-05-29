export type SessionState = 'launching' | 'running' | 'stopped' | 'failed'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Project {
  id: string
  name: string
  path: string
  env: Record<string, string>
  lastAgentId: string | null
  createdAt: string
}

export interface Session {
  id: string
  projectId: string
  agentId: string
  title: string | null
  branch: string | null
  pid: number | null
  state: SessionState
  remoteLink: string | null
  logs: string[]
  startedAt: string
  stoppedAt: string | null
  error: string | null
}

export interface AgentDefinition {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  linkPattern: string
  enabled: boolean
}

export interface AgentOverride {
  command?: string
  args?: string[]
  env?: Record<string, string>
  linkPattern?: string
}

export interface AppConfig {
  port: number
  host: string
  password: string
  sessionSecret: string
  sessionTTL: number
  linkExtractTimeout: number
  maxConcurrentSessions: number
  keepSessionLogsLines: number
  agents: Record<string, AgentOverride>
  globalEnv: Record<string, string>
  logLevel: LogLevel
}

// --- Terminal types (Phase 1.1) ---

/** Client → Server terminal messages */
export type TerminalClientEvent =
  | { type: 'terminal.input';  payload: { terminalId: string; data: string } }
  | { type: 'terminal.resize'; payload: { terminalId: string; cols: number; rows: number } }
  | { type: 'terminal.create'; payload: { cwd?: string; projectId?: string | null } }
  | { type: 'terminal.close';  payload: { terminalId: string } }
  | { type: 'terminal.attach'; payload: { sessionId: string } }

/** Server → Client terminal messages */
export type TerminalServerEvent =
  | { type: 'terminal.data';     payload: { terminalId: string; data: string } }
  | { type: 'terminal.created';  payload: { terminalId: string; title: string; pid: number; projectId?: string | null } }
  | { type: 'terminal.closed';   payload: { terminalId: string } }
  | { type: 'terminal.attached'; payload: { terminalId: string; sessionId: string } }

export type WsEvent =
  // logs are streamed only via 'session.log' + the initial GET /api/sessions
  // snapshot — never re-sent inside 'session.updated' (see ADR-0002 / logs invariant).
  | { type: 'session.updated'; payload: Omit<Session, 'logs'> }
  | { type: 'session.log'; payload: { sessionId: string; line: string } }
  | TerminalServerEvent
