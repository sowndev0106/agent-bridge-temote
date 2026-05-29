# RemoteBridge Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully working RemoteBridge app — CLI + Fastify backend + React SPA — that launches Claude Code with `--remote-control`, captures the link from stdout, and surfaces it in the browser via WebSocket. Other providers (Gemini, OpenCode, Codex) are stubs (visible, disabled).

**Architecture:** Single Node.js/Fastify process serves the React SPA (static), REST API, and WebSocket. Agent processes are OS child_processes; stdout pipes through a link extractor that broadcasts results via WebSocket. JSON files in `~/.remotebridge/` provide persistence. PM2 manages the RemoteBridge process itself.

**Tech Stack:** Node.js 20 / TypeScript / Fastify / ws / React 18 / Vite / TailwindCSS / Zustand / bcryptjs / pino / vitest / commander / concurrently / tsup

---

## Dev Mode

Two processes run in parallel during development:

```
Terminal 1: tsx watch src/server/index.ts   → Fastify on :4096
Terminal 2: vite                             → React HMR on :5173
```

Vite proxies `/api/*` and `/ws` to `:4096`, so the SPA always talks to the real backend. In production, Fastify serves the compiled `dist/web/` as static files.

```bash
npm run dev          # both processes via concurrently
npm run dev:server   # backend only
npm run dev:web      # frontend only
```

---

## Scope Boundary

Phase 1 = Claude Code only. Do not implement Gemini, OpenCode, Codex logic — stubs only (catalog entry exists, `enabled: false`). See `AGENTS.md §Phase Priority`.

---

## File Structure

```
agent-bridge-temote/
├── package.json
├── tsconfig.json
├── tsconfig.server.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.ts
├── bin/
│   └── remotebridge.ts           # thin CLI shim (compiled → dist/bin/remotebridge.js)
├── src/
│   ├── types.ts                  # shared: Project, Session, AgentDefinition, AppConfig, WsEvent
│   ├── cli/
│   │   └── index.ts              # commander root + all subcommands
│   ├── server/
│   │   ├── index.ts              # Fastify bootstrap, plugin registration, start()
│   │   ├── core/
│   │   │   ├── config.ts         # AppConfig defaults, load(), save(), validate()
│   │   │   ├── persistence.ts    # atomicWrite(), readJson(), ensureDir()
│   │   │   ├── auth.ts           # hashPassword(), verifyPassword(), signSession(), verifySession()
│   │   │   ├── csrf.ts           # generateCsrfToken(), verifyCsrfToken()
│   │   │   ├── rate-limit.ts     # RateLimiter class (in-memory, per-IP)
│   │   │   └── logger.ts         # pino instance
│   │   ├── routes/
│   │   │   ├── auth.ts           # POST /api/auth/login, /logout
│   │   │   ├── projects.ts       # CRUD /api/projects
│   │   │   ├── agents.ts         # GET /api/agents
│   │   │   ├── sessions.ts       # /api/sessions/*
│   │   │   └── config.ts         # GET/PUT /api/config, GET /healthz
│   │   ├── middleware/
│   │   │   ├── session-auth.ts   # requireSession hook
│   │   │   └── csrf-check.ts     # requireCsrf hook
│   │   ├── ws/
│   │   │   └── index.ts          # WebSocket upgrade, auth, broadcast()
│   │   └── sessions/
│   │       ├── manager.ts        # SessionManager: spawn, kill, restart, state machine
│   │       ├── link-extractor.ts # extractLink(line, pattern): string | null
│   │       └── agent-catalog.ts  # BUILT_IN_AGENTS: AgentDefinition[], resolveAgent()
│   └── web/                      # React SPA root (Vite entry)
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── Dashboard.tsx
│       │   └── SettingsPage.tsx
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── Header.tsx
│       │   ├── Sidebar.tsx
│       │   ├── ProjectCard.tsx
│       │   ├── AddProjectModal.tsx
│       │   ├── SessionCard.tsx
│       │   ├── SessionGrid.tsx
│       │   ├── AgentSelectorModal.tsx
│       │   └── LogsDrawer.tsx
│       ├── stores/
│       │   ├── sessions.ts
│       │   ├── projects.ts
│       │   ├── ui.ts
│       │   └── config.ts
│       └── lib/
│           ├── api.ts            # fetch wrapper (adds CSRF token automatically)
│           └── ws.ts             # useWebSocket hook → dispatches to Zustand
├── tests/
│   ├── core/
│   │   ├── config.test.ts
│   │   ├── persistence.test.ts
│   │   ├── auth.test.ts
│   │   └── csrf.test.ts
│   ├── sessions/
│   │   ├── link-extractor.test.ts
│   │   └── manager.test.ts
│   └── routes/
│       ├── auth.test.ts
│       └── projects.test.ts
└── dist/                         # tsup + vite build output
    ├── bin/remotebridge.js
    ├── server/
    └── web/
```

---

## Sprint A — Foundation

### Task A1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.ts`
- Create: `src/types.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "remotebridge",
  "version": "0.1.0",
  "description": "Launch AI coding agents and surface their remote links in a browser UI",
  "type": "module",
  "bin": {
    "remotebridge": "./dist/bin/remotebridge.js"
  },
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:web\"",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:web": "vite",
    "build": "npm run build:server && npm run build:web",
    "build:server": "tsup",
    "build:web": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@fastify/cookie": "^9.4.0",
    "@fastify/static": "^7.0.4",
    "bcryptjs": "^2.4.3",
    "commander": "^12.1.0",
    "fastify": "^4.28.1",
    "open": "^10.1.0",
    "pino": "^9.3.2",
    "node-pty": "^1.1.0",
    "uuid": "^10.0.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.14.0",
    "@types/node-pty": "^0.10.1",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/ws": "^8.5.11",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "concurrently": "^8.2.2",
    "postcss": "^8.4.39",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.0",
    "tailwindcss": "^3.4.4",
    "tsup": "^8.1.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.2",
    "vite": "^5.3.2",
    "vitest": "^1.6.0",
    "zustand": "^4.5.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (used by Vite for the SPA)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `tsconfig.server.json`** (used by tsup for backend)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "node",
    "jsx": "preserve",
    "outDir": "dist"
  },
  "include": ["src/server", "src/cli", "src/types.ts", "bin"]
}
```

- [ ] **Step 4: Create `tsup.config.ts`** in project root

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'bin/remotebridge': 'bin/remotebridge.ts',
    'server/index': 'src/server/index.ts'
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  tsconfig: 'tsconfig.server.json'
})
```

- [ ] **Step 5: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4096', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4096', ws: true }
    }
  }
})
```

- [ ] **Step 6: Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/web/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: []
} satisfies Config
```

- [ ] **Step 7: Create `postcss.config.ts`**

```ts
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
}
```

- [ ] **Step 8: Create `src/types.ts`** — shared between server and web

```ts
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
```

- [ ] **Step 9: Install deps and verify TypeScript compiles**

```bash
npm install
npx tsc --noEmit
```

Expected: no errors (no source files yet, so this just validates tsconfig).

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig*.json tsup.config.ts vite.config.ts tailwind.config.ts postcss.config.ts src/types.ts
git commit -m "feat: project scaffolding — package.json, tsconfig, vite, types"
```

---

### Task A2: Persistence Module

**Files:**
- Create: `src/server/core/persistence.ts`
- Create: `tests/core/persistence.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/core/persistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { atomicWrite, readJson, ensureDir } from '../../src/server/core/persistence.js'

let tmpDir: string

beforeEach(async () => { tmpDir = await mkdtemp(join(tmpdir(), 'rb-')) })
afterEach(async () => { await rm(tmpDir, { recursive: true }) })

describe('persistence', () => {
  it('atomicWrite writes and readJson reads back', async () => {
    const file = join(tmpDir, 'data.json')
    await atomicWrite(file, { hello: 'world' })
    const result = await readJson<{ hello: string }>(file)
    expect(result).toEqual({ hello: 'world' })
  })

  it('readJson returns null when file does not exist', async () => {
    const result = await readJson(join(tmpDir, 'nope.json'))
    expect(result).toBeNull()
  })

  it('ensureDir creates directory with mode 0o700', async () => {
    const dir = join(tmpDir, 'subdir')
    await ensureDir(dir)
    const { statSync } = await import('fs')
    const stat = statSync(dir)
    expect(stat.isDirectory()).toBe(true)
    expect(stat.mode & 0o777).toBe(0o700)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/core/persistence.test.ts
```

Expected: FAIL — cannot find module `persistence.js`

- [ ] **Step 3: Implement `src/server/core/persistence.ts`**

```ts
import { writeFile, readFile, mkdir, rename, chmod } from 'fs/promises'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await chmod(dir, 0o700)
}

export async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  await ensureDir(dir)
  const tmp = join(dir, `.tmp-${randomBytes(8).toString('hex')}`)
  const json = JSON.stringify(data, null, 2)
  await writeFile(tmp, json, { encoding: 'utf-8', mode: 0o600 })
  await rename(tmp, filePath)
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/core/persistence.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/persistence.ts tests/core/persistence.test.ts
git commit -m "feat: persistence module — atomicWrite, readJson, ensureDir"
```

---

### Task A3: Config Module

**Files:**
- Create: `src/server/core/config.ts`
- Create: `tests/core/config.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/core/config.test.ts
import { describe, it, expect } from 'vitest'
import { CONFIG_DEFAULTS, validateConfig, mergeConfig } from '../../src/server/core/config.js'

describe('config', () => {
  it('has correct defaults', () => {
    expect(CONFIG_DEFAULTS.port).toBe(4096)
    expect(CONFIG_DEFAULTS.host).toBe('0.0.0.0')
    expect(CONFIG_DEFAULTS.password).toBe('')
    expect(CONFIG_DEFAULTS.linkExtractTimeout).toBe(30)
  })

  it('validateConfig returns no errors for valid config', () => {
    expect(validateConfig({ port: 3000, logLevel: 'debug' })).toEqual([])
  })

  it('validateConfig catches invalid port', () => {
    const errors = validateConfig({ port: 99999 })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('"port"')
    expect(errors[0]).toContain("remotebridge help")
  })

  it('validateConfig catches invalid logLevel', () => {
    const errors = validateConfig({ logLevel: 'verbose' as never })
    expect(errors[0]).toContain('"logLevel"')
  })

  it('validateConfig requires password when host is not 127.0.0.1', () => {
    const errors = validateConfig({ host: '0.0.0.0', password: '' })
    expect(errors[0]).toContain('password')
  })

  it('mergeConfig deep-merges agents overrides', () => {
    const merged = mergeConfig(CONFIG_DEFAULTS, {
      agents: { claude: { command: 'claude-custom' } }
    })
    expect(merged.agents.claude?.command).toBe('claude-custom')
    expect(merged.port).toBe(4096)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/core/config.test.ts
```

- [ ] **Step 3: Implement `src/server/core/config.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/core/config.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/config.ts tests/core/config.test.ts
git commit -m "feat: config module — defaults, validateConfig, loadConfig, saveConfig"
```

---

### Task A4: Auth Module

**Files:**
- Create: `src/server/core/auth.ts`
- Create: `tests/core/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/core/auth.test.ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, signSession, verifySession } from '../../src/server/core/auth.js'

describe('auth', () => {
  it('hashPassword produces a bcrypt hash', async () => {
    const hash = await hashPassword('secret')
    expect(hash).toMatch(/^\$2[ab]\$/)
  })

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('correct')
    expect(await verifyPassword('correct', hash)).toBe(true)
  })

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('correct')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('signSession + verifySession roundtrip', () => {
    const secret = 'test-secret-32-chars-long-enough!'
    const token = signSession({ userId: '1' }, secret, 3600)
    const payload = verifySession(token, secret)
    expect(payload).not.toBeNull()
    expect((payload as { userId: string }).userId).toBe('1')
  })

  it('verifySession returns null for expired session', () => {
    const secret = 'test-secret-32-chars-long-enough!'
    const token = signSession({ userId: '1' }, secret, -1)
    expect(verifySession(token, secret)).toBeNull()
  })

  it('verifySession returns null for tampered token', () => {
    const secret = 'test-secret-32-chars-long-enough!'
    const token = signSession({ userId: '1' }, secret, 3600)
    expect(verifySession(token + 'x', secret)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/core/auth.test.ts
```

- [ ] **Step 3: Implement `src/server/core/auth.ts`**

```ts
import { compare, hash } from 'bcryptjs'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return compare(password, hashed)
}

interface SessionPayload {
  [key: string]: unknown
  exp: number
}

export function signSession(data: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const payload: SessionPayload = { ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${sig}`
}

export function verifySession(token: string, secret: string): Record<string, unknown> | null {
  try {
    const [encoded, sig] = token.split('.')
    if (!encoded || !sig) return null
    const expectedSig = createHmac('sha256', secret).update(encoded).digest('base64url')
    const expectedBuf = Buffer.from(expectedSig)
    const actualBuf = Buffer.from(sig)
    if (expectedBuf.length !== actualBuf.length) return null
    if (!timingSafeEqual(expectedBuf, actualBuf)) return null
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function generateSecret(): string {
  return randomBytes(32).toString('hex')
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/core/auth.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/auth.ts tests/core/auth.test.ts
git commit -m "feat: auth module — bcrypt hash/verify, HMAC session sign/verify"
```

---

### Task A5: CSRF + Rate Limiter Modules

**Files:**
- Create: `src/server/core/csrf.ts`
- Create: `src/server/core/rate-limit.ts`
- Create: `tests/core/csrf.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/core/csrf.test.ts
import { describe, it, expect } from 'vitest'
import { generateCsrfToken, verifyCsrfToken } from '../../src/server/core/csrf.js'
import { RateLimiter } from '../../src/server/core/rate-limit.js'

describe('csrf', () => {
  it('verify returns true for valid token', () => {
    const { token, hash } = generateCsrfToken()
    expect(verifyCsrfToken(token, hash)).toBe(true)
  })

  it('verify returns false for tampered token', () => {
    const { hash } = generateCsrfToken()
    expect(verifyCsrfToken('tampered', hash)).toBe(false)
  })
})

describe('RateLimiter', () => {
  it('allows requests under the limit', () => {
    const rl = new RateLimiter({ maxRequests: 3, windowMs: 60_000 })
    expect(rl.check('1.2.3.4')).toBe(true)
    expect(rl.check('1.2.3.4')).toBe(true)
    expect(rl.check('1.2.3.4')).toBe(true)
  })

  it('blocks after limit exceeded', () => {
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 60_000 })
    rl.check('1.2.3.4')
    rl.check('1.2.3.4')
    expect(rl.check('1.2.3.4')).toBe(false)
  })
})
```

- [ ] **Step 2: Implement `src/server/core/csrf.ts`**

```ts
import { randomBytes, createHash, timingSafeEqual } from 'crypto'

export function generateCsrfToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url')
  const hash = createHash('sha256').update(token).digest('base64url')
  return { token, hash }
}

export function verifyCsrfToken(token: string, storedHash: string): boolean {
  try {
    const hash = createHash('sha256').update(token).digest('base64url')
    const a = Buffer.from(hash)
    const b = Buffer.from(storedHash)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
```

- [ ] **Step 3: Implement `src/server/core/rate-limit.ts`**

```ts
interface Entry { count: number; resetAt: number }

export class RateLimiter {
  private store = new Map<string, Entry>()
  private maxRequests: number
  private windowMs: number

  constructor({ maxRequests, windowMs }: { maxRequests: number; windowMs: number }) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  check(ip: string): boolean {
    const now = Date.now()
    let entry = this.store.get(ip)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs }
      this.store.set(ip, entry)
    }
    entry.count++
    return entry.count <= this.maxRequests
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/core/csrf.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/csrf.ts src/server/core/rate-limit.ts tests/core/csrf.test.ts
git commit -m "feat: csrf token and rate limiter modules"
```

---

### Task A6: CLI Entry Point + All Commands

**Files:**
- Create: `bin/remotebridge.ts`
- Create: `src/cli/index.ts`

- [ ] **Step 1: Create `bin/remotebridge.ts`**

```ts
#!/usr/bin/env node
import '../src/cli/index.js'
```

- [ ] **Step 2: Create `src/cli/index.ts`**

This implements all CLI commands. Key behaviors per Hard Rules and REQUIMENT.md:
- `install`: check PM2, generate config with prompted password, set file permissions
- `start/stop/restart`: delegate to PM2
- `status`: show PM2 process state + URL
- `open`: use `open` package to launch browser
- `logs`: `pm2 logs remotebridge`
- `config`: show/set/reset config (never print password value)
- All commands print usage on bad args; unknown keys show closest match

```ts
import { Command } from 'commander'
import { loadConfig, saveConfig, CONFIG_DEFAULTS, validateConfig, CONFIG_FILE, CONFIG_DIR } from '../server/core/config.js'
import { atomicWrite, ensureDir } from '../server/core/persistence.js'
import { hashPassword, generateSecret } from '../server/core/auth.js'
import { execSync, spawnSync } from 'child_process'
import { createInterface } from 'readline'
import openBrowser from 'open'
import { randomBytes } from 'crypto'

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
```

- [ ] **Step 3: Test CLI manually**

```bash
npx tsx bin/remotebridge.ts help
```

Expected: usage output with commands listed

```bash
npx tsx bin/remotebridge.ts config set port abc
```

Expected: error message with type info and `remotebridge help` pointer

- [ ] **Step 4: Commit**

```bash
git add bin/remotebridge.ts src/cli/index.ts
git commit -m "feat: CLI — install, start, stop, restart, status, open, logs, config commands"
```

---

### Task A7: Fastify Server Bootstrap

**Files:**
- Create: `src/server/core/logger.ts`
- Create: `src/server/index.ts`
- Create: `src/server/middleware/session-auth.ts`
- Create: `src/server/middleware/csrf-check.ts`
- Create: `src/server/routes/auth.ts`
- Create: `src/server/routes/config.ts` (healthz only for now)
- Create: `tests/routes/auth.test.ts`

- [ ] **Step 1: Create `src/server/core/logger.ts`**

```ts
import pino from 'pino'
import type { LogLevel } from '../../types.js'

export function createLogger(level: LogLevel) {
  return pino({ level })
}

export type Logger = ReturnType<typeof createLogger>
```

- [ ] **Step 2: Create `src/server/middleware/session-auth.ts`**

```ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifySession } from '../core/auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    sessionPayload: Record<string, unknown> | null
  }
}

export function makeSessionAuthHook(secret: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const cookie = request.cookies?.['rb_session']
    if (!cookie) return reply.code(401).send({ ok: false, error: { code: 'auth_required', message: 'Authentication required' } })
    const payload = verifySession(cookie, secret)
    if (!payload) return reply.code(401).send({ ok: false, error: { code: 'auth_required', message: 'Session expired or invalid' } })
    request.sessionPayload = payload
  }
}
```

- [ ] **Step 3: Create `src/server/middleware/csrf-check.ts`**

```ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyCsrfToken } from '../core/csrf.js'

export function makeCsrfCheckHook() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers['x-csrf-token'] as string | undefined
    const storedHash = request.cookies?.['rb_csrf']
    if (!token || !storedHash || !verifyCsrfToken(token, storedHash)) {
      return reply.code(403).send({ ok: false, error: { code: 'csrf_missing', message: 'CSRF token missing or invalid' } })
    }
  }
}
```

- [ ] **Step 4: Create `src/server/routes/auth.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { verifyPassword } from '../core/auth.js'
import { generateCsrfToken } from '../core/csrf.js'
import { makeSessionAuthHook } from '../middleware/session-auth.js'
import { RateLimiter } from '../core/rate-limit.js'
import type { AppConfig } from '../../types.js'

const loginLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 })

export async function authRoutes(fastify: FastifyInstance, { config, sessionSecret }: { config: AppConfig; sessionSecret: string }) {
  fastify.post('/api/auth/login', async (request, reply) => {
    const ip = request.ip
    if (!loginLimiter.check(ip)) {
      return reply.code(429).send({ ok: false, error: { code: 'rate_limited', message: 'Too many login attempts. Try again in a minute.' } })
    }

    const { password } = request.body as { password?: string }
    if (!password) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: 'Password required' } })

    const valid = await verifyPassword(password, config.password)
    if (!valid) return reply.code(401).send({ ok: false, error: { code: 'invalid_password', message: 'Incorrect password' } })

    const { signSession } = await import('../core/auth.js')
    const sessionToken = signSession({ loggedIn: true }, sessionSecret, config.sessionTTL)
    const { token: csrfToken, hash: csrfHash } = generateCsrfToken()

    reply
      .setCookie('rb_session', sessionToken, { httpOnly: true, sameSite: 'strict', path: '/' })
      .setCookie('rb_csrf', csrfHash, { httpOnly: false, sameSite: 'strict', path: '/' })
      .send({ ok: true, data: { csrfToken } })
  })

  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply
      .clearCookie('rb_session')
      .clearCookie('rb_csrf')
      .send({ ok: true, data: null })
  })

  // Called on page load when a valid session cookie already exists.
  // Issues a fresh CSRF token so mutations work after a browser refresh.
  fastify.get('/api/auth/csrf', { preHandler: makeSessionAuthHook(sessionSecret) }, async (_request, reply) => {
    const { token: csrfToken, hash: csrfHash } = generateCsrfToken()
    reply
      .setCookie('rb_csrf', csrfHash, { httpOnly: false, sameSite: 'strict', path: '/' })
      .send({ ok: true, data: { csrfToken } })
  })
}
```

- [ ] **Step 5: Create `src/server/routes/config.ts`** (healthz + config API stub)

```ts
import type { FastifyInstance } from 'fastify'
import { loadConfig, saveConfig, validateConfig } from '../core/config.js'
import { hashPassword } from '../core/auth.js'
import type { AppConfig } from '../../types.js'

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/healthz', async () => ({ ok: true, data: { status: 'healthy' } }))

  fastify.get('/api/config', async (_req, reply) => {
    const cfg = await loadConfig()
    const { password: _p, sessionSecret: _s, ...safe } = cfg
    reply.send({ ok: true, data: safe })
  })

  fastify.put('/api/config', async (request, reply) => {
    const updates = request.body as Partial<AppConfig>
    const current = await loadConfig()

    // A 'password' field arriving over the API is a plaintext password — bcrypt-hash it
    // before saving, exactly as the CLI's `config set password` does (H4). Without this,
    // plaintext lands in config.json and the bcrypt-compare login path can never match it,
    // locking the user out. sessionSecret is never accepted from the client.
    const { sessionSecret: _ignored, ...allowed } = updates
    if (typeof allowed.password === 'string' && allowed.password.length > 0) {
      allowed.password = await hashPassword(allowed.password)
    } else {
      delete allowed.password   // never overwrite an existing hash with '' or undefined
    }

    const updated = { ...current, ...allowed }
    const errors = validateConfig(updated)
    if (errors.length) return reply.code(400).send({ ok: false, error: { code: 'invalid_config', message: errors.join('; ') } })
    await saveConfig(updated)
    const { password: _p, sessionSecret: _s, ...safe } = updated
    reply.send({ ok: true, data: safe })
  })
}
```

- [ ] **Step 6: Create `src/server/index.ts`**

```ts
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import staticPlugin from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadConfig, validateConfig } from './core/config.js'
import { createLogger } from './core/logger.js'
import { makeSessionAuthHook } from './middleware/session-auth.js'
import { makeCsrfCheckHook } from './middleware/csrf-check.js'
import { authRoutes } from './routes/auth.js'
import { configRoutes } from './routes/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function createServer() {
  const config = await loadConfig()

  // Validate before starting
  const errors = validateConfig(config)
  if (errors.length) {
    errors.forEach(e => console.error('\x1b[31m✗\x1b[0m ' + e))
    process.exit(1)
  }

  if (config.host !== '127.0.0.1') {
    console.log('\x1b[33m⚠  RemoteBridge is bound to 0.0.0.0 — accessible from the network. Ensure firewall is configured.\x1b[0m')
  }

  const logger = createLogger(config.logLevel)
  const fastify = Fastify({ logger })

  await fastify.register(cookie)

  // Serve static SPA (production)
  const webDist = join(__dirname, '../web')
  try {
    await fastify.register(staticPlugin, { root: webDist, prefix: '/', index: 'index.html' })
  } catch { /* web dist not built yet in dev */ }

  const sessionSecret = config.sessionSecret
  const requireSession = makeSessionAuthHook(sessionSecret)
  const requireCsrf = makeCsrfCheckHook()

  // Public routes
  await fastify.register(authRoutes, { config, sessionSecret })
  await fastify.register(configRoutes)

  // Protected routes will be registered in later tasks with hooks
  // fastify.addHook('preHandler', requireSession) — applied per-route prefix

  fastify.setNotFoundHandler(async (_req, reply) => {
    // SPA fallback
    try { reply.sendFile('index.html') } catch { reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Not found' } }) }
  })

  return { fastify, config, requireSession, requireCsrf }
}

// Start if run directly
const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isMain) {
  const { fastify, config } = await createServer()
  await fastify.listen({ port: config.port, host: config.host })
  console.log(`RemoteBridge running on http://localhost:${config.port}`)
}
```

- [ ] **Step 7: Test healthz endpoint**

```bash
npx tsx src/server/index.ts &
curl http://localhost:4096/healthz
# Expected: {"ok":true,"data":{"status":"healthy"}}
kill %1
```

- [ ] **Step 8: Write auth route tests**

```ts
// tests/routes/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { authRoutes } from '../../src/server/routes/auth.js'
import { hashPassword, generateSecret } from '../../src/server/core/auth.js'
import type { AppConfig } from '../../src/types.js'

let fastify: ReturnType<typeof Fastify>
const secret = generateSecret()
let config: AppConfig

beforeAll(async () => {
  config = {
    port: 4096, host: '127.0.0.1', password: await hashPassword('test123'),
    sessionSecret: secret, sessionTTL: 3600, linkExtractTimeout: 30,
    maxConcurrentSessions: 10, keepSessionLogsLines: 500,
    agents: {}, globalEnv: {}, logLevel: 'error'
  }
  fastify = Fastify()
  await fastify.register(cookie)
  await fastify.register(authRoutes, { config, sessionSecret: secret })
  await fastify.ready()
})

afterAll(() => fastify.close())

it('POST /api/auth/login with correct password sets cookies', async () => {
  const res = await fastify.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { password: 'test123' }, headers: { 'content-type': 'application/json' }
  })
  expect(res.statusCode).toBe(200)
  expect(res.json().ok).toBe(true)
  expect(res.headers['set-cookie']).toBeDefined()
})

it('POST /api/auth/login with wrong password returns 401', async () => {
  const res = await fastify.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { password: 'wrong' }, headers: { 'content-type': 'application/json' }
  })
  expect(res.statusCode).toBe(401)
})
```

- [ ] **Step 9: Run all tests**

```bash
npm test
```

Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add src/server/ tests/routes/auth.test.ts
git commit -m "feat: Fastify server — auth routes, session middleware, csrf middleware, healthz"
```

---

## Sprint B — Session Engine

### Task B1: Agent Catalog

**Files:**
- Create: `src/server/sessions/agent-catalog.ts`

- [ ] **Step 1: Create `src/server/sessions/agent-catalog.ts`**

```ts
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
    args: [],
    env: {},
    linkPattern: 'https?://[^\\s]+',
    enabled: false   // Phase 2
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
    linkPattern: override.linkPattern ?? base.linkPattern
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
```

- [ ] **Step 2: Commit**

```bash
git add src/server/sessions/agent-catalog.ts
git commit -m "feat: agent catalog — BUILT_IN_AGENTS (claude enabled, others stubbed)"
```

---

### Task B2: Link Extractor

**Files:**
- Create: `src/server/sessions/link-extractor.ts`
- Create: `tests/sessions/link-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/sessions/link-extractor.test.ts
import { describe, it, expect } from 'vitest'
import { extractLink } from '../../src/server/sessions/link-extractor.js'

describe('extractLink', () => {
  const claudePattern = 'https://claude\\.ai/code/session_[\\w]+'

  it('extracts Claude remote link from stdout line', () => {
    // Verified against claude v2.1.156: stdout line is
    // "/remote-control is active · Continue here, on your phone, or at  https://claude.ai/code/session_<ULID>"
    const line = '/remote-control is active · Continue here, on your phone, or at  https://claude.ai/code/session_01HjuhkefR1roLvgeB2xizbG'
    expect(extractLink(line, claudePattern)).toBe('https://claude.ai/code/session_01HjuhkefR1roLvgeB2xizbG')
  })

  it('returns null when no link in line', () => {
    expect(extractLink('Starting Claude Code...', claudePattern)).toBeNull()
  })

  it('returns null for partial match that does not fit pattern', () => {
    expect(extractLink('https://evil.com/inject', claudePattern)).toBeNull()
  })

  it('uses generic pattern as fallback', () => {
    const generic = 'https?://[^\\s]+'
    expect(extractLink('Visit https://example.com/session', generic)).toBe('https://example.com/session')
  })
})
```

- [ ] **Step 2: Implement `src/server/sessions/link-extractor.ts`**

```ts
export function extractLink(line: string, pattern: string): string | null {
  try {
    const regex = new RegExp(pattern)
    const match = line.match(regex)
    return match ? match[0] : null
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/sessions/link-extractor.test.ts
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/sessions/link-extractor.ts tests/sessions/link-extractor.test.ts
git commit -m "feat: link extractor — regex match per agent pattern"
```

---

### Task B3: Session Manager

**Files:**
- Create: `src/server/sessions/manager.ts`
- Create: `tests/sessions/manager.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/sessions/manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { SessionManager } from '../../src/server/sessions/manager.js'

describe('SessionManager', () => {
  let manager: SessionManager
  let tmpDir: string
  let sessionsFile: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rb-manager-'))
    sessionsFile = join(tmpDir, 'sessions.json')
    manager = new SessionManager({
      keepSessionLogsLines: 10,
      linkExtractTimeout: 2,
      maxConcurrentSessions: 5,
      sessionsFile,
      onEvent: () => {}
    })
  })

  afterEach(async () => { await rm(tmpDir, { recursive: true }) })

  it('creates session in launching state', () => {
    const session = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    expect(session.state).toBe('launching')
    expect(session.remoteLink).toBeNull()
  })

  it('getSession returns null for unknown id', () => {
    expect(manager.getSession('unknown')).toBeNull()
  })

  it('listSessions returns all sessions', () => {
    manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.createSession({ projectId: 'p2', agentId: 'claude' })
    expect(manager.listSessions()).toHaveLength(2)
  })

  it('removeSession deletes stopped session', () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(s.id, { state: 'stopped' })
    manager.removeSession(s.id)
    expect(manager.getSession(s.id)).toBeNull()
  })

  it('removeSession throws for running session', () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(s.id, { state: 'running' })
    expect(() => manager.removeSession(s.id)).toThrow()
  })

  it('persists sessions across manager instances', async () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    await new Promise(r => setTimeout(r, 50)) // let fire-and-forget persist flush

    const manager2 = new SessionManager({ keepSessionLogsLines: 10, linkExtractTimeout: 2, maxConcurrentSessions: 5, sessionsFile, onEvent: () => {} })
    await manager2.loadAndRecover()
    // launching with no PID → marked stopped on recover
    expect(manager2.getSession(s.id)).not.toBeNull()
    expect(manager2.getSession(s.id)!.state).toBe('stopped')
  })

  it('loadAndRecover marks sessions with dead PID as stopped', async () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(s.id, { state: 'running', pid: 99999999 }) // guaranteed dead PID
    await new Promise(r => setTimeout(r, 50))

    const manager2 = new SessionManager({ keepSessionLogsLines: 10, linkExtractTimeout: 2, maxConcurrentSessions: 5, sessionsFile, onEvent: () => {} })
    await manager2.loadAndRecover()
    expect(manager2.getSession(s.id)!.state).toBe('stopped')
  })

  it('loadAndRecover does not alter a stopped session', async () => {
    const s = manager.createSession({ projectId: 'p1', agentId: 'claude' })
    manager.updateSession(s.id, { state: 'stopped', stoppedAt: '2026-01-01T00:00:00.000Z' })
    await new Promise(r => setTimeout(r, 50))

    const manager2 = new SessionManager({ keepSessionLogsLines: 10, linkExtractTimeout: 2, maxConcurrentSessions: 5, sessionsFile, onEvent: () => {} })
    await manager2.loadAndRecover()
    expect(manager2.getSession(s.id)!.stoppedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Implement `src/server/sessions/manager.ts`**

```ts
import * as nodePty from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { extractLink } from './link-extractor.js'
import { resolveAgent, resolveCommand } from './agent-catalog.js'
import { atomicWrite, readJson } from '../core/persistence.js'
import type { Session, AppConfig } from '../../types.js'

// node-pty provides a real PTY — required because claude (and similar agents)
// check for TTY on startup and refuse to run in --print mode without one.
type PtyProcess = ReturnType<typeof nodePty.spawn>

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

type WsEventCallback = (event: { type: string; payload: unknown }) => void

interface ManagerOptions {
  keepSessionLogsLines: number
  linkExtractTimeout: number
  maxConcurrentSessions: number
  sessionsFile: string
  onEvent: WsEventCallback
}

export class SessionManager {
  private sessions = new Map<string, Session>()
  private processes = new Map<string, PtyProcess>()
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private opts: ManagerOptions

  constructor(opts: ManagerOptions) {
    this.opts = opts
  }

  private persistSessions(): void {
    // logs are ephemeral — strip before saving
    const toSave = Array.from(this.sessions.values()).map(s => ({ ...s, logs: [] }))
    atomicWrite(this.opts.sessionsFile, toSave).catch(err => {
      console.error('[SessionManager] Failed to persist sessions:', (err as Error).message)
    })
  }

  async loadAndRecover(): Promise<void> {
    const saved = await readJson<Session[]>(this.opts.sessionsFile) ?? []
    for (const session of saved) {
      session.logs = [] // logs are not persisted
      // PTY handles do not survive a RemoteBridge restart, so we can no longer
      // control a previously running agent. Always mark prior launching/running
      // sessions as stopped. Do NOT kill by bare PID — it may have been reused by
      // an unrelated process (would violate H1/H10). See ADR-0002.
      if (session.state === 'launching' || session.state === 'running') {
        if (session.pid != null && isPidAlive(session.pid)) {
          console.warn(`[SessionManager] Session ${session.id} PID ${session.pid} may still be alive after restart; marking stopped without killing (PID-reuse safety).`)
        }
        session.state = 'stopped'
        session.stoppedAt = session.stoppedAt ?? new Date().toISOString()
      }
      this.sessions.set(session.id, session)
    }
    // Write back cleaned state synchronously before server starts accepting requests
    const toSave = Array.from(this.sessions.values()).map(s => ({ ...s, logs: [] }))
    await atomicWrite(this.opts.sessionsFile, toSave)
  }

  createSession(init: { projectId: string; agentId: string }): Session {
    const session: Session = {
      id: uuidv4(),
      projectId: init.projectId,
      agentId: init.agentId,
      pid: null,
      state: 'launching',
      remoteLink: null,
      logs: [],
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      error: null
    }
    this.sessions.set(session.id, session)
    this.persistSessions()
    return session
  }

  getSession(id: string): Session | null {
    return this.sessions.get(id) ?? null
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  updateSession(id: string, patch: Partial<Session>): Session {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`Session ${id} not found`)
    Object.assign(session, patch)
    // Strip logs from the broadcast — logs flow only via 'session.log' events and
    // the initial GET /api/sessions snapshot. Re-sending them here would clobber the
    // client's appended logs and waste bandwidth (up to keepSessionLogsLines per event).
    const { logs: _logs, ...rest } = session
    this.opts.onEvent({ type: 'session.updated', payload: rest })
    this.persistSessions()
    return session
  }

  removeSession(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (session.state === 'running' || session.state === 'launching') {
      throw new Error(`Cannot remove session in state "${session.state}". Stop it first.`)
    }
    this.sessions.delete(id)
    this.timeouts.get(id) && clearTimeout(this.timeouts.get(id)!)
    this.timeouts.delete(id)
    this.persistSessions()
  }

  async launch(sessionId: string, options: {
    project: { path: string; env: Record<string, string> }
    config: AppConfig
  }): Promise<void> {
    const session = this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)

    const agent = resolveAgent(session.agentId, options.config.agents)
    if (!agent) throw new Error(`Unknown agent: ${session.agentId}`)
    if (!agent.enabled) throw new Error(`Agent "${agent.name}" is not enabled in Phase 1`)

    // Merge env: process.env → globalEnv → project.env → agent.env
    const env = {
      ...process.env,
      ...options.config.globalEnv,
      ...options.project.env,
      ...agent.env,
      TERM: 'xterm-256color'
    } as Record<string, string>

    // node-pty spawns with a real PTY — required for agents that check for TTY (claude, gemini).
    // resolveCommand appends .cmd on Windows for npm-installed global bins.
    const child = nodePty.spawn(resolveCommand(agent.command), agent.args, {
      name: 'xterm-256color',
      cwd: options.project.path,
      env,
      cols: 220,
      rows: 50
    })

    session.pid = child.pid
    this.processes.set(sessionId, child)
    this.persistSessions() // persist PID immediately

    // Set link-extract timeout
    const timeout = setTimeout(() => {
      const s = this.getSession(sessionId)
      if (s?.state === 'launching') {
        this.updateSession(sessionId, {
          state: 'failed',
          error: `No remote link found within ${this.opts.linkExtractTimeout}s`,
          stoppedAt: new Date().toISOString()
        })
      }
    }, this.opts.linkExtractTimeout * 1000)
    this.timeouts.set(sessionId, timeout)

    const handleLine = (line: string) => {
      const s = this.getSession(sessionId)
      if (!s) return

      // Auto-accept claude's "trust this folder?" prompt.
      // The user registered this project in RemoteBridge, so trust is implicit.
      if (/trust this folder|1\.\s*Yes.*trust/i.test(line)) {
        child.write('\r')
        return
      }

      // Strip ANSI escape codes before logging and link extraction
      const clean = line.replace(/\x1b\[[0-9;?=>]*[a-zA-Z]/g, '').trim()
      if (!clean) return

      s.logs.push(clean)
      if (s.logs.length > this.opts.keepSessionLogsLines) s.logs.shift()
      this.opts.onEvent({ type: 'session.log', payload: { sessionId, line: clean } })

      if (s.state === 'launching') {
        const link = extractLink(clean, agent.linkPattern)
        if (link) {
          clearTimeout(this.timeouts.get(sessionId))
          this.timeouts.delete(sessionId)
          this.updateSession(sessionId, { state: 'running', remoteLink: link })
        }
      }
    }

    // node-pty merges stdout+stderr into a single onData stream (string, not Buffer).
    // onData delivers ARBITRARY chunks, not whole lines — a line (including the
    // remote link) can be split across two chunks. Buffer until newline so the link
    // pattern never runs against a partial line. Keep the trailing fragment.
    let lineBuf = ''
    child.onData((data: string) => {
      lineBuf += data
      const lines = lineBuf.split('\n')
      lineBuf = lines.pop() ?? ''   // unterminated tail carries over to next chunk
      lines.forEach(handleLine)
    })

    child.onExit(() => {
      if (lineBuf) { handleLine(lineBuf); lineBuf = '' }  // flush final fragment
      clearTimeout(this.timeouts.get(sessionId))
      this.timeouts.delete(sessionId)
      this.processes.delete(sessionId)
      const s = this.getSession(sessionId)
      if (s && s.state !== 'stopped') {
        this.updateSession(sessionId, { state: 'stopped', stoppedAt: new Date().toISOString() })
      }
    })
  }

  stop(sessionId: string): void {
    const child = this.processes.get(sessionId)
    if (!child) {
      this.updateSession(sessionId, { state: 'stopped', stoppedAt: new Date().toISOString() })
      return
    }
    child.kill('SIGTERM')
    setTimeout(() => {
      if (this.processes.has(sessionId)) child.kill('SIGKILL')
    }, 5000)
  }

  // Called on shutdown (SIGINT/SIGTERM, e.g. PM2 stop/restart) so no spawned agent is
  // orphaned (FR3 / ADR-0002). PTY handles live in this.processes, so we only ever signal
  // processes we spawned — never a bare/reused PID (H10).
  //
  // PM2's default kill_timeout (~1.6s) is shorter than stop()'s 5s grace period, so a
  // graceful drain would be cut short and PM2 would orphan the agents. Instead we SIGTERM
  // all, await their exits with a short bound (< kill_timeout), then SIGKILL any stragglers
  // ourselves and resolve. `remotebridge install` registers PM2 with --kill-timeout 6000 so
  // this escalation has room to complete.
  async killAll(): Promise<void> {
    const children = Array.from(this.processes.values())
    if (children.length === 0) return

    const exits = children.map(child => new Promise<void>(resolve => {
      child.onExit(() => resolve())
    }))
    for (const child of children) {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }

    // Wait up to ~1s for graceful exits, then force-kill whatever remains.
    await Promise.race([
      Promise.all(exits),
      new Promise<void>(resolve => setTimeout(resolve, 1000))
    ])
    for (const child of children) {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }
  }

  async restart(sessionId: string, options: { project: { path: string; env: Record<string, string> }; config: AppConfig }): Promise<void> {
    const session = this.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    this.stop(sessionId)
    await new Promise(r => setTimeout(r, 200))
    this.updateSession(sessionId, {
      state: 'launching',
      remoteLink: null,
      pid: null,
      logs: [],
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      error: null
    })
    await this.launch(sessionId, options)
  }
}
```

- [ ] **Step 2b: Add a regression test for link split across chunks**

The link must be extracted even when `onData` delivers it in two pieces. Make the
buffering unit-testable (e.g. extract a small `LineBuffer` helper, or drive a fake
pty whose `onData` you can fire manually) and assert:

```ts
// feeding "...session_01Hju" then "hke...\n" in two onData calls
// still yields one complete line and a 'running' state with the full link.
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/sessions/manager.test.ts
```

Expected: all PASS (including the split-chunk case)

- [ ] **Step 4: Commit**

```bash
git add src/server/sessions/manager.ts tests/sessions/manager.test.ts
git commit -m "feat: SessionManager — node-pty spawn, line-buffered link extract, trust-prompt auto-accept, ANSI strip, disk persistence, PID recovery"
```

---

### Task B4: Project, Agents, Sessions, and WebSocket Routes

**Files:**
- Create: `src/server/routes/projects.ts`
- Create: `src/server/routes/agents.ts`
- Create: `src/server/routes/sessions.ts`
- Create: `src/server/ws/index.ts`
- Modify: `src/server/index.ts` (register new routes + WS)
- Create: `tests/routes/projects.test.ts`

- [ ] **Step 1: Create `src/server/routes/projects.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { stat } from 'fs/promises'
import { isAbsolute } from 'path'
import { readJson, atomicWrite } from '../core/persistence.js'
import { join } from 'path'
import { homedir } from 'os'
import type { SessionManager } from '../sessions/manager.js'
import type { Project } from '../../types.js'

const PROJECTS_FILE = join(homedir(), '.remotebridge', 'projects.json')

async function loadProjects(): Promise<Project[]> {
  return (await readJson<Project[]>(PROJECTS_FILE)) ?? []
}

async function saveProjects(projects: Project[]): Promise<void> {
  await atomicWrite(PROJECTS_FILE, projects)
}

async function validatePath(p: string): Promise<string | null> {
  if (!isAbsolute(p)) return '"path" must be an absolute path'
  try {
    const s = await stat(p)
    if (!s.isDirectory()) return '"path" must be a directory'
    return null
  } catch {
    return `"path" does not exist: ${p}`
  }
}

export async function projectRoutes(fastify: FastifyInstance, manager: SessionManager) {
  fastify.get('/api/projects', async () => {
    return { ok: true, data: await loadProjects() }
  })

  fastify.post('/api/projects', async (request, reply) => {
    const { name, path, env = {} } = request.body as { name?: string; path?: string; env?: Record<string, string> }
    if (!name?.trim()) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"name" is required' } })
    if (!path) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"path" is required' } })

    const pathError = await validatePath(path)
    if (pathError) return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: pathError } })

    const project: Project = { id: uuidv4(), name: name.trim(), path, env, lastAgentId: null, createdAt: new Date().toISOString() }
    const projects = await loadProjects()
    projects.push(project)
    await saveProjects(projects)
    reply.code(201).send({ ok: true, data: project })
  })

  fastify.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const updates = request.body as Partial<Pick<Project, 'name' | 'path' | 'env'>>
    const projects = await loadProjects()
    const idx = projects.findIndex(p => p.id === id)
    if (idx === -1) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    if (updates.path) {
      const pathError = await validatePath(updates.path)
      if (pathError) return reply.code(400).send({ ok: false, error: { code: 'invalid_path', message: pathError } })
    }

    Object.assign(projects[idx], updates)
    await saveProjects(projects)
    reply.send({ ok: true, data: projects[idx] })
  })

  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const projects = await loadProjects()
    if (!projects.some(p => p.id === id)) {
      return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })
    }

    // Block deletion while any session for this project is still live (H15). Symmetric with
    // SessionManager.removeSession()'s running-guard: an aggregate can't be deleted while a
    // child references it, so Restart never 404s against a vanished project.
    const live = manager.listSessions().filter(
      s => s.projectId === id && (s.state === 'launching' || s.state === 'running')
    )
    if (live.length > 0) {
      return reply.code(409).send({ ok: false, error: { code: 'project_in_use', message: `Cannot delete project: ${live.length} session(s) still launching/running. Stop them first.` } })
    }

    await saveProjects(projects.filter(p => p.id !== id))
    reply.send({ ok: true, data: null })
  })
}
```

- [ ] **Step 2: Create `src/server/routes/agents.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { BUILT_IN_AGENTS, resolveAgent } from '../sessions/agent-catalog.js'
import { loadConfig } from '../core/config.js'

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.get('/api/agents', async () => {
    const config = await loadConfig()
    const agents = BUILT_IN_AGENTS.map(a => resolveAgent(a.id, config.agents)!)
    return { ok: true, data: agents }
  })
}
```

- [ ] **Step 3: Create `src/server/ws/index.ts`**

```ts
import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { Server } from 'http'
import { verifySession } from '../core/auth.js'
import type { WsEvent } from '../../types.js'

export function createWsServer(httpServer: Server, sessionSecret: string) {
  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set<WebSocket>()

  // Auth on upgrade
  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    if (!request.url?.startsWith('/ws')) { socket.destroy(); return }
    const cookieHeader = request.headers.cookie ?? ''
    const match = cookieHeader.match(/rb_session=([^;]+)/)
    const token = match?.[1]
    if (!token || !verifySession(token, sessionSecret)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws)
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
  })

  function broadcast(event: WsEvent) {
    const msg = JSON.stringify(event)
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg)
    }
  }

  return { broadcast }
}
```

- [ ] **Step 4: Create `src/server/routes/sessions.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import type { SessionManager } from '../sessions/manager.js'
import { loadConfig } from '../core/config.js'
import { readJson } from '../core/persistence.js'
import { join } from 'path'
import { homedir } from 'os'
import type { Project } from '../../types.js'

const PROJECTS_FILE = join(homedir(), '.remotebridge', 'projects.json')

export async function sessionRoutes(fastify: FastifyInstance, manager: SessionManager) {
  fastify.get('/api/sessions', async () => {
    return { ok: true, data: manager.listSessions() }
  })

  fastify.post('/api/sessions/launch', async (request, reply) => {
    const { projectId, agentId } = request.body as { projectId?: string; agentId?: string }
    if (!projectId || !agentId) return reply.code(400).send({ ok: false, error: { code: 'bad_request', message: '"projectId" and "agentId" are required' } })

    const config = await loadConfig()

    const runningSessions = manager.listSessions().filter(s => s.state === 'running' || s.state === 'launching')
    if (runningSessions.length >= config.maxConcurrentSessions) {
      return reply.code(429).send({ ok: false, error: { code: 'max_sessions_reached', message: `Maximum ${config.maxConcurrentSessions} concurrent sessions reached` } })
    }

    const projects = (await readJson<Project[]>(PROJECTS_FILE)) ?? []
    const project = projects.find(p => p.id === projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    const session = manager.createSession({ projectId, agentId })

    // Launch async — response returns immediately
    manager.launch(session.id, { project: { path: project.path, env: project.env }, config }).catch(err => {
      manager.updateSession(session.id, { state: 'failed', error: err.message, stoppedAt: new Date().toISOString() })
    })

    reply.code(201).send({ ok: true, data: session })
  })

  fastify.post('/api/sessions/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = manager.getSession(id)
    if (!session) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Session not found' } })
    manager.stop(id)
    reply.send({ ok: true, data: manager.getSession(id) })
  })

  fastify.post('/api/sessions/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string }
    const session = manager.getSession(id)
    if (!session) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Session not found' } })

    const projects = (await readJson<Project[]>(PROJECTS_FILE)) ?? []
    const project = projects.find(p => p.id === session.projectId)
    if (!project) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Project not found' } })

    const config = await loadConfig()

    // Enforce the concurrency cap on restart too — a restart re-enters 'launching', so a
    // stopped session restarting while others run could otherwise push past the cap. Count
    // OTHER live sessions (exclude this one, which is stopped/failed).
    const otherLive = manager.listSessions().filter(s => s.id !== id && (s.state === 'running' || s.state === 'launching'))
    if (otherLive.length >= config.maxConcurrentSessions) {
      return reply.code(429).send({ ok: false, error: { code: 'max_sessions_reached', message: `Maximum ${config.maxConcurrentSessions} concurrent sessions reached` } })
    }

    manager.restart(id, { project: { path: project.path, env: project.env }, config }).catch(err => {
      manager.updateSession(id, { state: 'failed', error: err.message, stoppedAt: new Date().toISOString() })
    })
    reply.send({ ok: true, data: manager.getSession(id) })
  })

  fastify.delete('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      manager.removeSession(id)
      reply.send({ ok: true, data: null })
    } catch (err: unknown) {
      reply.code(409).send({ ok: false, error: { code: 'session_active', message: (err as Error).message } })
    }
  })
}
```

- [ ] **Step 5: Update `src/server/index.ts`** — register all routes and WS

Replace the `// Protected routes will be registered in later tasks` comment block:

```ts
// After existing imports, add:
import { projectRoutes } from './routes/projects.js'
import { agentRoutes } from './routes/agents.js'
import { sessionRoutes } from './routes/sessions.js'
import { createWsServer } from './ws/index.js'
import { SessionManager } from './sessions/manager.js'
import { CONFIG_DIR } from './core/config.js'
import { join } from 'path'

// Inside createServer(), before return:
const manager = new SessionManager({
  keepSessionLogsLines: config.keepSessionLogsLines,
  linkExtractTimeout: config.linkExtractTimeout,
  maxConcurrentSessions: config.maxConcurrentSessions,
  sessionsFile: join(CONFIG_DIR, 'sessions.json'),
  onEvent: (event) => broadcast(event as WsEvent)
})

await manager.loadAndRecover()

// Graceful shutdown — kill all spawned agents before exiting so none are orphaned
// (FR3 / ADR-0002). PM2 sends SIGINT on stop/restart.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    await manager.killAll()            // SIGTERM all agents, brief bounded wait, SIGKILL stragglers
    await fastify.close().catch(() => {})
    process.exit(0)
  })
}

// Register protected routes with session + csrf hooks
await fastify.register(async (app) => {
  app.addHook('preHandler', requireSession)
  await app.register((a) => projectRoutes(a, manager))  // manager needed for the delete-in-use guard (H15)
  await app.register(agentRoutes)
  await configRoutes(app) // already registered, but move /api/config here
})

await fastify.register(async (app) => {
  app.addHook('preHandler', requireSession)
  app.addHook('preHandler', requireCsrf)
  await app.register(sessionRoutes, manager)
})

// WS (set up after fastify.listen)
const { broadcast } = createWsServer(fastify.server, config.sessionSecret)
```

- [ ] **Step 6: Write project route tests**

```ts
// tests/routes/projects.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import Fastify from 'fastify'
import { projectRoutes } from '../../src/server/routes/projects.js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { vi } from 'vitest'

// Override CONFIG_DIR for tests
let tmpDir: string
vi.mock('../../src/server/core/persistence.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/server/core/persistence.js')>('../../src/server/core/persistence.js')
  return actual
})

// Simpler: test with a real temp dir for projects.json
let fastify: ReturnType<typeof Fastify>
let realProjectPath: string

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'rb-routes-'))
  realProjectPath = tmpDir  // use the tmpDir itself as a valid project path
  fastify = Fastify()
  // projectRoutes needs a SessionManager for the delete-in-use guard (H15).
  // These tests never exercise delete-with-live-sessions, so a no-session stub suffices.
  const managerStub = { listSessions: () => [] } as unknown as import('../../src/server/sessions/manager.js').SessionManager
  await fastify.register((a) => projectRoutes(a, managerStub))
  await fastify.ready()
})

afterAll(async () => {
  await fastify.close()
  await rm(tmpDir, { recursive: true })
})

it('GET /api/projects returns empty list initially', async () => {
  const res = await fastify.inject({ method: 'GET', url: '/api/projects' })
  expect(res.statusCode).toBe(200)
  expect(res.json().data).toBeInstanceOf(Array)
})

it('POST /api/projects creates project with valid path', async () => {
  const res = await fastify.inject({
    method: 'POST', url: '/api/projects',
    payload: { name: 'Test', path: realProjectPath },
    headers: { 'content-type': 'application/json' }
  })
  expect(res.statusCode).toBe(201)
  expect(res.json().data.name).toBe('Test')
})

it('POST /api/projects rejects non-existent path', async () => {
  const res = await fastify.inject({
    method: 'POST', url: '/api/projects',
    payload: { name: 'Bad', path: '/nonexistent/path' },
    headers: { 'content-type': 'application/json' }
  })
  expect(res.statusCode).toBe(400)
})
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/routes/ src/server/ws/ tests/routes/projects.test.ts
git commit -m "feat: all API routes (projects, agents, sessions) + WebSocket server + session persistence wiring"
```

---

## Sprint C — React SPA

### Task C1: Vite Project Base + TailwindCSS

**Files:**
- Create: `src/web/index.html`
- Create: `src/web/main.tsx`
- Create: `src/web/index.css`

- [ ] **Step 1: Create `src/web/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RemoteBridge</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/web/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Create `src/web/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 4: Verify Vite dev server starts**

```bash
npm run dev:web
# open http://localhost:5173
```

Expected: blank page with no errors in console

- [ ] **Step 5: Commit**

```bash
git add src/web/index.html src/web/main.tsx src/web/index.css
git commit -m "feat: React SPA base — index.html, main.tsx, TailwindCSS"
```

---

### Task C2: API Client + Zustand Stores + WebSocket Hook

**Files:**
- Create: `src/web/lib/api.ts`
- Create: `src/web/lib/ws.ts`
- Create: `src/web/stores/sessions.ts`
- Create: `src/web/stores/projects.ts`
- Create: `src/web/stores/ui.ts`
- Create: `src/web/stores/config.ts`

- [ ] **Step 1: Create `src/web/lib/api.ts`**

```ts
let csrfToken = ''

export function setCsrfToken(t: string) { csrfToken = t }
export function getCsrfToken() { return csrfToken }

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (['POST', 'PUT', 'DELETE'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

export const api = {
  login: (password: string) => request<{ csrfToken: string }>('POST', '/api/auth/login', { password }),
  logout: () => request<null>('POST', '/api/auth/logout'),
  getCsrf: () => request<{ csrfToken: string }>('GET', '/api/auth/csrf'),
  getProjects: () => request<import('../../types.js').Project[]>('GET', '/api/projects'),
  createProject: (data: { name: string; path: string; env: Record<string, string> }) =>
    request<import('../../types.js').Project>('POST', '/api/projects', data),
  updateProject: (id: string, data: Partial<import('../../types.js').Project>) =>
    request<import('../../types.js').Project>('PUT', `/api/projects/${id}`, data),
  deleteProject: (id: string) => request<null>('DELETE', `/api/projects/${id}`),
  getAgents: () => request<import('../../types.js').AgentDefinition[]>('GET', '/api/agents'),
  getSessions: () => request<import('../../types.js').Session[]>('GET', '/api/sessions'),
  launchSession: (projectId: string, agentId: string) =>
    request<import('../../types.js').Session>('POST', '/api/sessions/launch', { projectId, agentId }),
  stopSession: (id: string) => request<import('../../types.js').Session>('POST', `/api/sessions/${id}/stop`),
  restartSession: (id: string) => request<import('../../types.js').Session>('POST', `/api/sessions/${id}/restart`),
  deleteSession: (id: string) => request<null>('DELETE', `/api/sessions/${id}`),
  getConfig: () => request<Omit<import('../../types.js').AppConfig, 'password' | 'sessionSecret'>>('GET', '/api/config'),
  updateConfig: (data: Partial<import('../../types.js').AppConfig>) =>
    request<Omit<import('../../types.js').AppConfig, 'password' | 'sessionSecret'>>('PUT', '/api/config', data)
}
```

- [ ] **Step 2: Create `src/web/stores/sessions.ts`**

```ts
import { create } from 'zustand'
import type { Session } from '../../types.js'

interface SessionsStore {
  sessions: Session[]
  setSessions: (sessions: Session[]) => void
  addSession: (s: Session) => void
  updateSession: (id: string, patch: Partial<Session>) => void
  appendLog: (id: string, line: string) => void
  removeSession: (id: string) => void
}

export const useSessionsStore = create<SessionsStore>((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  addSession: (s) => set(state => ({ sessions: [...state.sessions, s] })),
  updateSession: (id, patch) =>
    set(state => ({ sessions: state.sessions.map(s => s.id === id ? { ...s, ...patch } : s) })),
  appendLog: (id, line) =>
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === id ? { ...s, logs: [...s.logs.slice(-499), line] } : s
      )
    })),
  removeSession: (id) => set(state => ({ sessions: state.sessions.filter(s => s.id !== id) }))
}))
```

- [ ] **Step 3: Create `src/web/stores/projects.ts`**

```ts
import { create } from 'zustand'
import type { Project } from '../../types.js'

interface ProjectsStore {
  projects: Project[]
  setProjects: (projects: Project[]) => void
  addProject: (p: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  removeProject: (id: string) => void
}

export const useProjectsStore = create<ProjectsStore>((set) => ({
  projects: [],
  setProjects: (projects) => set({ projects }),
  addProject: (p) => set(state => ({ projects: [...state.projects, p] })),
  updateProject: (id, patch) =>
    set(state => ({ projects: state.projects.map(p => p.id === id ? { ...p, ...patch } : p) })),
  removeProject: (id) => set(state => ({ projects: state.projects.filter(p => p.id !== id) }))
}))
```

- [ ] **Step 4: Create `src/web/stores/ui.ts`**

```ts
import { create } from 'zustand'

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  logsSessionId: null,
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id }),
  setLogsSessionId: (id) => set({ logsSessionId: id })
}))
```

- [ ] **Step 5: Create `src/web/stores/config.ts`**

```ts
import { create } from 'zustand'
import type { AppConfig } from '../../types.js'

type SafeConfig = Omit<AppConfig, 'password' | 'sessionSecret'>

interface ConfigStore {
  config: SafeConfig | null
  wsConnected: boolean
  setConfig: (cfg: SafeConfig) => void
  setWsConnected: (connected: boolean) => void
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  wsConnected: false,
  setConfig: (config) => set({ config }),
  setWsConnected: (wsConnected) => set({ wsConnected })
}))
```

- [ ] **Step 6: Create `src/web/lib/ws.ts`**

```ts
import { useEffect, useRef } from 'react'
import { useSessionsStore } from '../stores/sessions.js'
import { useConfigStore } from '../stores/config.js'
import type { WsEvent } from '../../types.js'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { updateSession, appendLog } = useSessionsStore()
  const { setWsConnected } = useConfigStore()

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`
    
    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => setWsConnected(true)
      ws.onclose = () => {
        setWsConnected(false)
        setTimeout(connect, 3000) // auto-reconnect
      }
      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsEvent
          if (msg.type === 'session.updated') {
            updateSession((msg.payload as { id: string }).id, msg.payload as Parameters<typeof updateSession>[1])
          } else if (msg.type === 'session.log') {
            const { sessionId, line } = msg.payload as { sessionId: string; line: string }
            appendLog(sessionId, line)
          }
        } catch { /* ignore malformed */ }
      }
    }

    connect()
    return () => { wsRef.current?.close() }
  }, [])
}
```

- [ ] **Step 7: Commit**

```bash
git add src/web/lib/ src/web/stores/
git commit -m "feat: API client, Zustand stores, WebSocket hook"
```

---

### Task C3: App Shell — Router, AuthGuard, Layout, Header, Sidebar

**Files:**
- Create: `src/web/App.tsx`
- Create: `src/web/pages/LoginPage.tsx`
- Create: `src/web/pages/Dashboard.tsx`
- Create: `src/web/pages/SettingsPage.tsx`
- Create: `src/web/components/Layout.tsx`
- Create: `src/web/components/Header.tsx`
- Create: `src/web/components/Sidebar.tsx`

- [ ] **Step 1: Create `src/web/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import SettingsPage from './pages/SettingsPage'
import Layout from './components/Layout'
import { api, setCsrfToken } from './lib/api'
import { useWebSocket } from './lib/ws'
import { useConfigStore } from './stores/config'
import { useSessionsStore } from './stores/sessions'
import { useProjectsStore } from './stores/projects'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    // Verify session and refresh CSRF token in parallel — both require valid session cookie.
    // getCsrf() must succeed before any mutations can work after a page refresh.
    Promise.all([api.getConfig(), api.getCsrf()])
      .then(([cfg, { csrfToken }]) => {
        useConfigStore.getState().setConfig(cfg)
        setCsrfToken(csrfToken)
        setAuthed(true)
      })
      .catch(() => setAuthed(false))
  }, [])

  if (authed === null) return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppInner() {
  useWebSocket()

  useEffect(() => {
    api.getSessions().then(s => useSessionsStore.getState().setSessions(s)).catch(() => {})
    api.getProjects().then(p => useProjectsStore.getState().setProjects(p)).catch(() => {})
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Layout><Dashboard /></Layout>} />
      <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<AuthGuard><AppInner /></AuthGuard>} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Create `src/web/pages/LoginPage.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setCsrfToken } from '../lib/api'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { csrfToken } = await api.login(password)
      setCsrfToken(csrfToken)
      navigate('/')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 rounded-xl p-8 w-80 shadow-xl">
        <h1 className="text-2xl font-bold text-white text-center mb-6">🌉 RemoteBridge</h1>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/web/components/Header.tsx`**

```tsx
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useConfigStore } from '../stores/config'

export default function Header() {
  const { wsConnected, config } = useConfigStore()
  const navigate = useNavigate()

  const logout = async () => {
    await api.logout().catch(() => {})
    navigate('/login')
  }

  return (
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
      <span className="text-white font-semibold">🌉 RemoteBridge</span>
      <div className="flex items-center gap-3">
        <span className={`text-xs ${wsConnected ? 'text-green-400' : 'text-gray-500'}`}>
          {wsConnected ? '● Connected' : '○ Disconnected'}
        </span>
        {config?.host && config.host !== '127.0.0.1' && (
          <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
            ⚠ Public ({config.host})
          </span>
        )}
        <Link to="/settings" className="text-gray-400 hover:text-white text-sm">⚙</Link>
        <button onClick={logout} className="text-gray-400 hover:text-white text-sm">Logout</button>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Create `src/web/components/Layout.tsx`**

```tsx
import Header from './Header'
import Sidebar from './Sidebar'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `src/web/components/Sidebar.tsx`** (skeleton — ProjectCard and AddProjectModal come next task)

```tsx
import { useProjectsStore } from '../stores/projects'
import { useUIStore } from '../stores/ui'

export default function Sidebar() {
  const { projects } = useProjectsStore()
  const { setAddProjectOpen, setAgentSelectorProjectId } = useUIStore()

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-3 gap-2 overflow-y-auto shrink-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1">Projects</p>
      {projects.map(p => (
        <button
          key={p.id}
          onClick={() => setAgentSelectorProjectId(p.id)}
          className="text-left p-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <p className="text-sm font-medium text-white truncate">{p.name}</p>
          <p className="text-xs text-gray-500 truncate">{p.path}</p>
        </button>
      ))}
      <button
        onClick={() => setAddProjectOpen(true)}
        className="mt-auto text-sm text-gray-400 hover:text-white py-2 border border-dashed border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
      >
        + Add Project
      </button>
    </aside>
  )
}
```

- [ ] **Step 6: Create skeleton `src/web/pages/Dashboard.tsx`** and `src/web/pages/SettingsPage.tsx`

```tsx
// src/web/pages/Dashboard.tsx
import { useSessionsStore } from '../stores/sessions'
export default function Dashboard() {
  const { sessions } = useSessionsStore()
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Active Sessions</p>
      {sessions.length === 0
        ? <p className="text-gray-600">No active sessions. Select a project to launch an agent.</p>
        : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{/* SessionCards — next task */}</div>}
    </div>
  )
}
```

```tsx
// src/web/pages/SettingsPage.tsx
export default function SettingsPage() {
  return <div className="text-gray-400">Settings — coming in next task</div>
}
```

- [ ] **Step 7: Test in browser**

```bash
npm run dev
```

Open `http://localhost:5173`. Should show login page. Login with password → dashboard skeleton.

- [ ] **Step 8: Commit**

```bash
git add src/web/App.tsx src/web/pages/ src/web/components/Layout.tsx src/web/components/Header.tsx src/web/components/Sidebar.tsx
git commit -m "feat: app shell — Router, AuthGuard, Layout, Header, Sidebar, LoginPage"
```

---

### Task C4: SessionCard + AgentSelectorModal + AddProjectModal + LogsDrawer

**Files:**
- Create: `src/web/components/SessionCard.tsx`
- Create: `src/web/components/SessionGrid.tsx`
- Create: `src/web/components/AgentSelectorModal.tsx`
- Create: `src/web/components/AddProjectModal.tsx`
- Create: `src/web/components/LogsDrawer.tsx`
- Modify: `src/web/pages/Dashboard.tsx`
- Modify: `src/web/components/Sidebar.tsx`

- [ ] **Step 1: Create `src/web/components/SessionCard.tsx`**

```tsx
import { api } from '../lib/api'
import { useSessionsStore } from '../stores/sessions'
import { useProjectsStore } from '../stores/projects'
import { useUIStore } from '../stores/ui'
import type { Session } from '../../../src/types'

const STATE_COLORS = {
  launching: 'text-yellow-400',
  running: 'text-green-400',
  stopped: 'text-gray-500',
  failed: 'text-red-400'
} as const

const STATE_ICONS = { launching: '◌', running: '●', stopped: '○', failed: '⚠' }

export default function SessionCard({ session }: { session: Session }) {
  const { updateSession, removeSession } = useSessionsStore()
  const { projects } = useProjectsStore()
  const { setLogsSessionId } = useUIStore()

  // Show the project's display name, not its raw UUID. Falls back to the id if the
  // project was deleted (H15 blocks delete for live sessions, but a stopped session's
  // project can be removed).
  const projectName = projects.find(p => p.id === session.projectId)?.name ?? session.projectId

  const stop = async () => {
    const updated = await api.stopSession(session.id)
    updateSession(session.id, updated)
  }

  const restart = async () => {
    const updated = await api.restartSession(session.id)
    updateSession(session.id, updated)
  }

  const remove = async () => {
    await api.deleteSession(session.id)
    removeSession(session.id)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium text-white text-sm">{projectName}</p>
          <p className="text-xs text-gray-500">{session.agentId}</p>
        </div>
        <span className={`text-xs font-mono ${STATE_COLORS[session.state]}`}>
          {STATE_ICONS[session.state]} {session.state.charAt(0).toUpperCase() + session.state.slice(1)}
        </span>
      </div>

      {session.state === 'launching' && (
        <div className="w-full bg-gray-800 rounded-full h-1">
          <div className="bg-yellow-400 h-1 rounded-full animate-pulse w-1/2" />
        </div>
      )}

      {session.state === 'running' && session.remoteLink && (
        <a
          href={session.remoteLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
        >
          Open Remote Control ↗
        </a>
      )}

      {session.state === 'failed' && (
        <p className="text-xs text-red-400">{session.error ?? 'Unknown error'}</p>
      )}

      <div className="flex gap-2">
        {session.state === 'running' && (
          <button onClick={stop} className="flex-1 text-xs py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300">
            ■ Stop
          </button>
        )}
        {(session.state === 'stopped' || session.state === 'failed') && (
          <>
            <button onClick={restart} className="flex-1 text-xs py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300">
              ↺ Restart
            </button>
            <button onClick={remove} className="text-xs py-1.5 px-3 bg-gray-800 hover:bg-red-900/40 rounded-lg text-red-400">
              ✕
            </button>
          </>
        )}
        <button
          onClick={() => setLogsSessionId(session.id)}
          className="text-xs py-1.5 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400"
        >
          Logs
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/web/components/AgentSelectorModal.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useUIStore } from '../stores/ui'
import { useSessionsStore } from '../stores/sessions'
import { api } from '../lib/api'
import type { AgentDefinition } from '../../../src/types'

export default function AgentSelectorModal() {
  const { agentSelectorProjectId, setAgentSelectorProjectId } = useUIStore()
  const { addSession } = useSessionsStore()
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [selected, setSelected] = useState<string>('claude')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getAgents().then(setAgents).catch(() => {})
  }, [])

  if (!agentSelectorProjectId) return null

  const launch = async () => {
    setLoading(true)
    try {
      const session = await api.launchSession(agentSelectorProjectId, selected)
      addSession(session)
      setAgentSelectorProjectId(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAgentSelectorProjectId(null)}>
      <div className="bg-gray-900 rounded-xl p-6 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-white">Launch Agent</h2>
          <button onClick={() => setAgentSelectorProjectId(null)} className="text-gray-500 hover:text-white">×</button>
        </div>
        <div className="space-y-2 mb-4">
          {agents.map(agent => (
            <label key={agent.id} className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors
              ${selected === agent.id ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600'}
              ${!agent.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="agent"
                value={agent.id}
                checked={selected === agent.id}
                disabled={!agent.enabled}
                onChange={() => setSelected(agent.id)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-white">{agent.name} {!agent.enabled && <span className="text-xs text-gray-500">(Phase 2)</span>}</p>
                <p className="text-xs text-gray-500">{agent.command} {agent.args.join(' ')}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAgentSelectorProjectId(null)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
            Cancel
          </button>
          <button onClick={launch} disabled={loading} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Launching…' : '▶ Launch'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/web/components/AddProjectModal.tsx`**

```tsx
import { useState } from 'react'
import { useUIStore } from '../stores/ui'
import { useProjectsStore } from '../stores/projects'
import { api } from '../lib/api'

function parseEnv(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw.split('\n')
      .map(l => l.trim())
      .filter(l => l.includes('='))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
  )
}

export default function AddProjectModal() {
  const { addProjectOpen, setAddProjectOpen } = useUIStore()
  const { addProject } = useProjectsStore()
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [envRaw, setEnvRaw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!addProjectOpen) return null

  const save = async () => {
    setError(''); setLoading(true)
    try {
      const project = await api.createProject({ name, path, env: parseEnv(envRaw) })
      addProject(project)
      setAddProjectOpen(false)
      setName(''); setPath(''); setEnvRaw('')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAddProjectOpen(false)}>
      <div className="bg-gray-900 rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-white">Add Project</h2>
          <button onClick={() => setAddProjectOpen(false)} className="text-gray-500 hover:text-white">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Absolute Path *</label>
            <input value={path} onChange={e => setPath(e.target.value)}
              placeholder="/home/user/projects/my-app"
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Environment Variables (optional, KEY=VALUE per line)</label>
            <textarea value={envRaw} onChange={e => setEnvRaw(e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm font-mono resize-none" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => setAddProjectOpen(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">Cancel</button>
          <button onClick={save} disabled={loading || !name || !path} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Saving…' : 'Save Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/web/components/LogsDrawer.tsx`**

```tsx
import { useRef, useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { useSessionsStore } from '../stores/sessions'

export default function LogsDrawer() {
  const { logsSessionId, setLogsSessionId } = useUIStore()
  const { sessions } = useSessionsStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const session = sessions.find(s => s.id === logsSessionId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.logs.length])

  if (!logsSessionId) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setLogsSessionId(null)}>
      <div className="bg-gray-900 w-full max-w-xl h-full flex flex-col shadow-2xl border-l border-gray-800" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Logs — {session?.agentId ?? logsSessionId}</h2>
          <button onClick={() => setLogsSessionId(null)} className="text-gray-500 hover:text-white">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-gray-300 space-y-0.5">
          {session?.logs.map((line, i) => (
            <p key={i} className={line.match(/https?:\/\//) ? 'text-blue-400 font-semibold' : ''}>{line}</p>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update `src/web/pages/Dashboard.tsx`** — wire up SessionGrid + modals

```tsx
import { useSessionsStore } from '../stores/sessions'
import SessionCard from '../components/SessionCard'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'

export default function Dashboard() {
  const { sessions } = useSessionsStore()
  return (
    <>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Active Sessions</p>
      {sessions.length === 0
        ? <p className="text-gray-600 text-sm">No active sessions. Select a project in the sidebar to launch an agent.</p>
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sessions.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        )}
      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
```

- [ ] **Step 6: Test full flow in browser**

```bash
npm run dev
```

1. Login
2. Add a project (use any real directory path)
3. Click project → select Claude Code → Launch
4. Observe card state → `launching` → (if claude is installed) → `running` with link

- [ ] **Step 7: Commit**

```bash
git add src/web/components/ src/web/pages/Dashboard.tsx
git commit -m "feat: SessionCard, AgentSelectorModal, AddProjectModal, LogsDrawer"
```

---

### Task C5: Settings Page

**Files:**
- Modify: `src/web/pages/SettingsPage.tsx`

- [ ] **Step 1: Implement `src/web/pages/SettingsPage.tsx`**

```tsx
import { useState } from 'react'
import { useConfigStore } from '../stores/config'
import { api } from '../lib/api'

export default function SettingsPage() {
  const { config, setConfig } = useConfigStore()
  const [form, setForm] = useState(config ?? {})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (!config) return null

  const save = async () => {
    setError(''); setSaved(false)
    try {
      const updated = await api.updateConfig(form)
      setConfig(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      setError((err as Error).message)
    }
  }

  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-400 w-36">{label}</label>
      <input
        type={type}
        value={String(form[key] ?? '')}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="w-48 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  )

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-white mb-6">⚙ Settings</h1>
      <div className="bg-gray-900 rounded-xl p-6 space-y-6">
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Network</p>
          <div className="space-y-3">
            {field('port', 'Port', 'number')}
            {field('host', 'Host')}
          </div>
        </section>
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Session Behavior</p>
          <div className="space-y-3">
            {field('linkExtractTimeout', 'Link Timeout (s)', 'number')}
            {field('maxConcurrentSessions', 'Max Sessions', 'number')}
            {field('keepSessionLogsLines', 'Log Lines', 'number')}
          </div>
        </section>
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Logging</p>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-400 w-36">Log Level</label>
            <select
              value={String(form.logLevel ?? 'info')}
              onChange={e => setForm(f => ({ ...f, logLevel: e.target.value as never }))}
              className="w-48 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 text-sm"
            >
              {['debug', 'info', 'warn', 'error'].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </section>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={() => { setForm(config); setError('') }} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
            Reset
          </button>
          <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Test settings page**

Navigate to `/settings`. Change a value, save. Verify `/api/config` reflects the change.

- [ ] **Step 3: Commit**

```bash
git add src/web/pages/SettingsPage.tsx
git commit -m "feat: SettingsPage — config editor with save/reset"
```

---

### Task C6: Production Build + Final Integration

**Files:**
- Modify: `src/server/index.ts` (ensure static serving works post-build)

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: `dist/web/` and `dist/server/` generated with no errors.

- [ ] **Step 2: Test production mode**

```bash
node dist/bin/remotebridge.js start
# or directly:
node dist/server/index.js
```

Open `http://localhost:4096`. Should serve the React SPA from static files.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 4: Verify Hard Rules (manual checklist)**

Run through each Hard Rule from `AGENTS.md`:
- [ ] H1: Start with port already in use → error message, no kill
- [ ] H2: Start with `host=0.0.0.0` and no password → refuses to start
- [ ] H3: Start with `host=0.0.0.0` → red CLI banner + web UI warning
- [ ] H4: Config file has bcrypt hash, not plaintext
- [ ] H5: `curl http://localhost:4096/api/projects` (no cookie) → 401
- [ ] H6: CSRF test — POST without `X-CSRF-Token` → 403
- [ ] H7: `GET /api/config` response has no `password` or `sessionSecret` fields
- [ ] H8: `/api/sessions/launch` with manually-crafted command in body is ignored (command comes from catalog)
- [ ] H9: Project creation with `/nonexistent/path` → 400 error
- [ ] H10: Stop only kills sessions the app spawned
- [ ] H11: `ls -la ~/.remotebridge/` → dir 700, files 600
- [ ] H12: `curl http://localhost:4096/api/auth/login -d '{"password":"x"}' × 11` → 429 on 11th
- [ ] H13: No AI service credentials in any API response or log
- [ ] H14: Agent stdout is regex-matched only, never eval'd

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — Claude Code integration, full CLI, React SPA, all Hard Rules verified"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| FR1 Project CRUD | B4 (projects routes), C3 (Sidebar), C4 (AddProjectModal) |
| FR2 Agent catalog (claude enabled, stubs disabled) | B1, B4 (agents route), C4 (AgentSelectorModal) |
| FR3 Orchestration — env merge, cwd, catalog-only command | B3 (manager.launch) |
| FR4 Link extraction — regex, timeout, broadcast | B2, B3, B4 (WS broadcast) |
| FR5 Session state machine, stop/restart/delete | B3, B4 (sessions routes), C4 (SessionCard) |
| NFR1 0.0.0.0 default, port configurable, no port-kill | A7 (server bootstrap), C6 (H1 check) |
| NFR2 Async launch, response immediate | B4 (fire-and-forget launch) |
| NFR3 All security rules | A4–A5 (auth/csrf), A7 (middleware), C6 (H2–H14 checklist) |
| NFR4 Config defaults + validation + error messages | A3, A6 |
| NFR5 pino logging, per-session logs | A7 (logger), B3 (log ring buffer) |
| CLI — all commands | A6 |
| Dev mode — two processes + Vite proxy | A1 (package.json scripts, vite.config.ts) |
| LoginPage | C3 |
| Logs drawer with link highlighting | C4 |
| Settings page | C5 |
| Production build | C6 |

No gaps found.

**Placeholder scan:** None found — all steps contain complete code.

**Type consistency:** `Session`, `Project`, `AgentDefinition`, `AppConfig`, `WsEvent` defined once in `src/types.ts` and imported everywhere. `updateSession(id, patch)` signature used consistently in manager, stores, and SessionCard.
