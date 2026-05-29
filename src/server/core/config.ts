import { readJson, atomicWrite } from './persistence.js'
import { homedir } from 'os'
import { join } from 'path'
import type { AppConfig } from '../../types.js'

export const CONFIG_DIR = join(homedir(), '.remotebridge')
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export const CONFIG_DEFAULTS: AppConfig = {
  port: 4096,
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
      errors.push(`"port" must be an integer between 1-65535 (got ${cfg.port}). Run 'remotebridge help' for usage.`)
    }
  }

  if (cfg.logLevel !== undefined && !['debug', 'info', 'warn', 'error'].includes(cfg.logLevel)) {
    errors.push(`"logLevel" must be one of: debug, info, warn, error (got "${cfg.logLevel}"). Run 'remotebridge help' for usage.`)
  }

  if (cfg.sessionTTL !== undefined && (typeof cfg.sessionTTL !== 'number' || cfg.sessionTTL < 60)) {
    errors.push(`"sessionTTL" must be a number ≥ 60 seconds. Run 'remotebridge help' for usage.`)
  }

  const host = cfg.host ?? CONFIG_DEFAULTS.host
  const password = cfg.password ?? CONFIG_DEFAULTS.password
  if (host !== '127.0.0.1' && !password) {
    errors.push(`"password" is required when "host" is not 127.0.0.1. Run: remotebridge config set password <yourpassword>`)
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

export async function loadConfig(): Promise<AppConfig> {
  const saved = await readJson<Partial<AppConfig>>(CONFIG_FILE)
  if (!saved) return { ...CONFIG_DEFAULTS }
  return mergeConfig(CONFIG_DEFAULTS, saved)
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await atomicWrite(CONFIG_FILE, cfg)
}
