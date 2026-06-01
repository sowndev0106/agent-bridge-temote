import type { AgentDefinition, AgentOverride, AppConfig } from '../../types.js'

export const BUILT_IN_AGENTS: AgentDefinition[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    args: ['--remote-control'],
    env: {},
    linkPattern: 'https://claude\\.ai/code/session_[\\w]+',
    enabled: true
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    args: ['--remote'],
    env: {},
    linkPattern: 'https?://[\\w.-]+:\\d+/[\\w?=&-]*',
    enabled: false   // Phase 2
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    args: ['serve'],
    env: {},
    linkPattern: 'http://127\\.0\\.0\\.1:\\d+',
    enabled: false   // Phase 2
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    args: ['app-server', '--listen', 'ws://127.0.0.1:{{port}}'],
    env: {},
    linkPattern: 'ws://127\\.0\\.0\\.1:\\d+',
    enabled: true
  }
]

export function resolveAgent(agentId: string, configOverrides: AppConfig['agents']): AgentDefinition | null {
  const base = BUILT_IN_AGENTS.find(a => a.id === agentId)
  if (!base) return null
  const override: AgentOverride = configOverrides[agentId] ?? {}
  return {
    ...base,
    command: override.command ?? base.command,
    args: override.args ?? base.args,
    env: { ...base.env, ...override.env },
    linkPattern: override.linkPattern ?? base.linkPattern,
    enabled: override.enabled ?? base.enabled
  }
}

// On Windows, npm-installed global bins are .cmd shims (e.g. claude.cmd).
// node-pty does not resolve these automatically, so append .cmd at spawn time.
// Absolute paths and commands that already have an extension are left untouched.
export function resolveCommand(command: string): string {
  if (process.platform !== 'win32') return command
  if (/\.(cmd|bat|exe)$/i.test(command)) return command
  if (command.includes('/') || command.includes('\\')) return command
  return `${command}.cmd`
}
