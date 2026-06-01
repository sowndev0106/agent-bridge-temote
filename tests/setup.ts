import { join } from 'path'
import { tmpdir } from 'os'

// Redirect HOME to a throwaway sandbox BEFORE any test module (and the top-level
// os.homedir() consts in config.ts / projects.ts / sessions.ts) loads, so tests never
// touch the developer's real ~/.agent-remote-control. setupFiles run before test files are imported.
const SANDBOX_HOME = join(tmpdir(), `rb-vitest-home-${process.pid}`)
process.env.HOME = SANDBOX_HOME
process.env.USERPROFILE = SANDBOX_HOME

// Write a valid default configuration in the sandbox so server-creating tests do not crash
import { mkdirSync, writeFileSync } from 'fs'
const configDir = join(SANDBOX_HOME, '.agent-remote-control')
mkdirSync(configDir, { recursive: true })
writeFileSync(
  join(configDir, 'config.json'),
  JSON.stringify({
    port: 4096,
    host: '127.0.0.1',
    password: '',
    sessionSecret: 'test-session-secret-1234567890',
    sessionTTL: 86400,
    linkExtractTimeout: 30,
    maxConcurrentSessions: 10,
    keepSessionLogsLines: 500,
    agents: {},
    globalEnv: {},
    logLevel: 'info'
  })
)

