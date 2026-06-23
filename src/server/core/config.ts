import { readJson, atomicWrite } from './persistence.js'
import { CONFIG_DIR, CONFIG_FILE } from './paths.js'
import { hashPassword } from './auth.js'
import type { AppConfig } from '../../types.js'

// Re-exported for back-compat with existing importers.
export { CONFIG_DIR, CONFIG_FILE }

export const CONFIG_DEFAULTS: AppConfig = {
  port: 4444,
  host: '0.0.0.0',
  password: '',
  sessionSecret: '',
  sessionTTL: 86400,
  linkExtractTimeout: 30,
  maxConcurrentSessions: 10,
  keepSessionLogsLines: 500,
  agents: {},
  globalEnv: {},
  logLevel: 'info'
}

export function validateConfig(cfg: Partial<AppConfig>): string[] {
  const errors: string[] = []

  if (cfg.port !== undefined) {
    if (typeof cfg.port !== 'number' || !Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) {
      errors.push(`"port" must be an integer between 1-65535 (got ${cfg.port}). Run 'arc help' for usage.`)
    }
  }

  if (cfg.logLevel !== undefined && !['debug', 'info', 'warn', 'error'].includes(cfg.logLevel)) {
    errors.push(`"logLevel" must be one of: debug, info, warn, error (got "${cfg.logLevel}"). Run 'arc help' for usage.`)
  }

  if (cfg.sessionTTL !== undefined && (typeof cfg.sessionTTL !== 'number' || cfg.sessionTTL < 60)) {
    errors.push(`"sessionTTL" must be a number ≥ 60 seconds. Run 'arc help' for usage.`)
  }

  const host = cfg.host ?? CONFIG_DEFAULTS.host
  const password = cfg.password ?? CONFIG_DEFAULTS.password
  if (host !== '127.0.0.1' && !password) {
    errors.push(`"password" is required when "host" is not 127.0.0.1. Run: arc config set password <yourpassword>`)
  }

  // An empty sessionSecret would sign session tokens with an empty HMAC key — generated
  // by `arc install`. Refuse to run without it rather than issue weak cookies.
  const sessionSecret = cfg.sessionSecret ?? CONFIG_DEFAULTS.sessionSecret
  if (!sessionSecret) {
    errors.push(`"sessionSecret" is not set — run 'arc install' to generate one. Run 'arc help' for usage.`)
  }

  return errors
}

export function mergeConfig(base: AppConfig, override: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...override,
    agents: { ...base.agents, ...override.agents },
    globalEnv: { ...base.globalEnv, ...override.globalEnv }
  }
}

/**
 * Read config fields from environment variables (RB_* prefix).
 * These take highest priority — useful in dev mode or CI without touching
 * ~/.agent-remote-control/config.json.
 *
 * Supported vars:
 *   RB_PORT               number
 *   RB_HOST               string
 *   RB_PASSWORD           string — plaintext OR bcrypt hash (auto-detected)
 *   RB_SESSION_SECRET     string
 *   RB_SESSION_TTL        number (seconds)
 *   RB_LOG_LEVEL          debug | info | warn | error
 *   RB_LINK_EXTRACT_TIMEOUT  number (seconds)
 *   RB_MAX_CONCURRENT_SESSIONS  number
 *   RB_KEEP_SESSION_LOGS_LINES  number
 */
export async function loadEnvConfig(): Promise<Partial<AppConfig>> {
  const env = process.env
  const out: Partial<AppConfig> = {}

  if (env.RB_PORT)                        out.port = Number(env.RB_PORT)
  if (env.RB_HOST)                        out.host = env.RB_HOST
  if (env.RB_PASSWORD) {
    // Accept plaintext for dev convenience — auto-hash if not already a bcrypt hash.
    out.password = env.RB_PASSWORD.startsWith('$2')
      ? env.RB_PASSWORD
      : await hashPassword(env.RB_PASSWORD)
  }
  if (env.RB_SESSION_SECRET)              out.sessionSecret = env.RB_SESSION_SECRET
  if (env.RB_SESSION_TTL)                 out.sessionTTL = Number(env.RB_SESSION_TTL)
  if (env.RB_LOG_LEVEL)                   out.logLevel = env.RB_LOG_LEVEL as AppConfig['logLevel']
  if (env.RB_LINK_EXTRACT_TIMEOUT)        out.linkExtractTimeout = Number(env.RB_LINK_EXTRACT_TIMEOUT)
  if (env.RB_MAX_CONCURRENT_SESSIONS)     out.maxConcurrentSessions = Number(env.RB_MAX_CONCURRENT_SESSIONS)
  if (env.RB_KEEP_SESSION_LOGS_LINES)     out.keepSessionLogsLines = Number(env.RB_KEEP_SESSION_LOGS_LINES)

  return out
}

export async function loadConfig(): Promise<AppConfig> {
  const saved = await readJson<Partial<AppConfig>>(CONFIG_FILE)
  const fromFile = saved ? mergeConfig(CONFIG_DEFAULTS, saved) : { ...CONFIG_DEFAULTS }
  // Env vars take highest priority so dev mode / CI can override without
  // touching ~/.agent-remote-control/config.json.
  return mergeConfig(fromFile, await loadEnvConfig())
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await atomicWrite(CONFIG_FILE, cfg)
}
