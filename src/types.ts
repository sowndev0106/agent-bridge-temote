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

export type WsEvent =
  // logs are streamed only via 'session.log' + the initial GET /api/sessions
  // snapshot — never re-sent inside 'session.updated' (see ADR-0002 / logs invariant).
  | { type: 'session.updated'; payload: Omit<Session, 'logs'> }
  | { type: 'session.log'; payload: { sessionId: string; line: string } }
