import { Session, AppConfig } from '../../types.js'

export interface LaunchOptions {
  project: { path: string; env: Record<string, string> }
  config: AppConfig
}

export interface AgentAdapter {
  launch(sessionId: string, options: LaunchOptions, isRestart?: boolean): Promise<void>
  stop(sessionId: string): void
  sendMessage?(sessionId: string, input: string): Promise<void>
  resolveApproval?(sessionId: string, approvalId: string, decision: 'approved' | 'rejected'): Promise<void>
}
