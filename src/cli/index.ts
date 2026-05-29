import { Command } from 'commander'
import { loadConfig, CONFIG_DEFAULTS, validateConfig, CONFIG_FILE, CONFIG_DIR } from '../server/core/config.js'
import { atomicWrite, ensureDir } from '../server/core/persistence.js'
import { hashPassword, generateSecret } from '../server/core/auth.js'
import { execSync, spawnSync } from 'child_process'
import { createInterface } from 'readline'
import openBrowser from 'open'

const program = new Command('remotebridge')

program
  .name('remotebridge')
  .description('Launch AI coding agents and surface their remote links in a browser UI')
  .version('0.1.0')

// ─── help ────────────────────────────────────────────────────────────────────
program.addHelpText('after', `
Examples:
  remotebridge install          Set up PM2 service and initial config
  remotebridge start            Start the server
  remotebridge status           Show server status and URL
  remotebridge config set port 3000

Config keys: port, host, password, sessionTTL, linkExtractTimeout,
             maxConcurrentSessions, keepSessionLogsLines, logLevel, globalEnv
`)

// ─── install ─────────────────────────────────────────────────────────────────
program
  .command('install')
  .description('Set up PM2 service, generate config, and prompt for password')
  .action(async () => {
    // Check PM2
    try { execSync('pm2 --version', { stdio: 'ignore' }) } catch {
      console.error('Error: pm2 not found. Install it first: npm install -g pm2')
      process.exit(1)
    }

    // Smoke-test the node-pty native module. On a fresh machine without a build
    // toolchain (Python + C/C++ compiler, or VS Build Tools on Windows) the prebuilt
    // binary may be missing/mismatched and require() throws here rather than at first
    // launch. Turn the node-gyp wall-of-text into an actionable message (see ADR-0001).
    try {
      await import('node-pty')
    } catch (err) {
      console.error('Error: node-pty failed to load — RemoteBridge cannot spawn agents.')
      console.error(`  ${(err as Error).message}`)
      console.error('  Install a build toolchain and reinstall:')
      console.error('    Linux:   sudo apt-get install -y build-essential python3')
      console.error('    macOS:   xcode-select --install')
      console.error('    Windows: npm install -g windows-build-tools  (or install VS Build Tools)')
      console.error("  Then: npm install -g remotebridge. Run 'remotebridge help' for usage.")
      process.exit(1)
    }

    await ensureDir(CONFIG_DIR)
    const cfg = await loadConfig()

    // Prompt password
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const password: string = await new Promise(resolve =>
      rl.question('Set app password (required for network access): ', resolve))
    rl.close()

    if (!password) { console.error('Password cannot be empty.'); process.exit(1) }

    cfg.password = await hashPassword(password)
    cfg.sessionSecret = generateSecret()
    await atomicWrite(CONFIG_FILE, cfg)

    // Register with PM2.
    // --kill-timeout 6000: PM2's default (~1.6s) is shorter than SessionManager.killAll()'s
    // SIGTERM->wait->SIGKILL window, so without this PM2 would SIGKILL the daemon mid-drain
    // and orphan the agents. 6s gives killAll() room to finish (FR3 / ADR-0002).
    const scriptPath = new URL('../server/index.js', import.meta.url).pathname
    spawnSync('pm2', ['start', scriptPath, '--name', 'remotebridge', '--interpreter', 'node', '--kill-timeout', '6000'], { stdio: 'inherit' })
    spawnSync('pm2', ['save'], { stdio: 'inherit' })

    console.log(`\n✓ RemoteBridge installed. Run: remotebridge start`)
    console.log(`  Web UI: http://localhost:${cfg.port}`)
    console.log('\n\x1b[33m⚠  Bound to 0.0.0.0 — accessible from network. Ensure firewall is configured.\x1b[0m')
  })

// ─── start ───────────────────────────────────────────────────────────────────
program.command('start').description('Start the server via PM2').action(() => {
  spawnSync('pm2', ['start', 'remotebridge'], { stdio: 'inherit' })
})

// ─── stop ────────────────────────────────────────────────────────────────────
program.command('stop').description('Stop the server').action(() => {
  spawnSync('pm2', ['stop', 'remotebridge'], { stdio: 'inherit' })
})

// ─── restart ─────────────────────────────────────────────────────────────────
program.command('restart').description('Restart the server').action(() => {
  spawnSync('pm2', ['restart', 'remotebridge'], { stdio: 'inherit' })
})

// ─── status ──────────────────────────────────────────────────────────────────
program.command('status').description('Show process state and URL').action(async () => {
  spawnSync('pm2', ['show', 'remotebridge'], { stdio: 'inherit' })
  const cfg = await loadConfig()
  console.log(`\nWeb UI: http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}`)
})

// ─── open ────────────────────────────────────────────────────────────────────
program.command('open').description('Open web UI in default browser').action(async () => {
  const cfg = await loadConfig()
  const url = `http://localhost:${cfg.port}`
  console.log(`Opening ${url}`)
  await openBrowser(url)
})

// ─── logs ────────────────────────────────────────────────────────────────────
program.command('logs').description('Tail PM2 logs').action(() => {
  spawnSync('pm2', ['logs', 'remotebridge'], { stdio: 'inherit' })
})

// ─── config ──────────────────────────────────────────────────────────────────
const configCmd = program.command('config').description('View or update config')

configCmd.action(async () => {
  const cfg = await loadConfig()
  const safe = { ...cfg, password: cfg.password ? '[set]' : '[not set]', sessionSecret: '[hidden]' }
  console.log(JSON.stringify(safe, null, 2))
})

const VALID_KEYS = Object.keys(CONFIG_DEFAULTS) as (keyof typeof CONFIG_DEFAULTS)[]

configCmd
  .command('set <key> <value>')
  .description('Update a config value')
  .action(async (key: string, value: string) => {
    if (!VALID_KEYS.includes(key as never)) {
      const closest = VALID_KEYS.find(k => k.startsWith(key[0])) ?? VALID_KEYS[0]
      console.error(`Unknown config key: "${key}". Did you mean "${closest}"?`)
      console.error(`Valid keys: ${VALID_KEYS.join(', ')}`)
      console.error(`Run 'remotebridge help' for usage.`)
      process.exit(1)
    }

    const cfg = await loadConfig()
    let parsed: unknown = value
    const defaultVal = CONFIG_DEFAULTS[key as keyof typeof CONFIG_DEFAULTS]

    if (typeof defaultVal === 'number') {
      parsed = Number(value)
      if (isNaN(parsed as number)) {
        console.error(`"${key}" must be a number. Got: "${value}". Run 'remotebridge help' for usage.`)
        process.exit(1)
      }
    }

    if (key === 'password') {
      parsed = await hashPassword(value)
      console.log('Password updated (stored as bcrypt hash).')
    }

    const updated = { ...cfg, [key]: parsed }
    const errors = validateConfig(updated)
    if (errors.length) { errors.forEach(e => console.error(e)); process.exit(1) }

    await atomicWrite(CONFIG_FILE, updated)
    if (key !== 'password') console.log(`✓ ${key} = ${value}`)
  })

configCmd
  .command('reset')
  .description('Reset config to factory defaults')
  .action(async () => {
    await atomicWrite(CONFIG_FILE, CONFIG_DEFAULTS)
    console.log('✓ Config reset to defaults. You will need to set a password before starting.')
  })

program.parseAsync(process.argv).catch(err => {
  console.error(err.message)
  process.exit(1)
})
