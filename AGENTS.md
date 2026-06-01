# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex, Cursor, Gemini, etc.) when working in this repository.

## Scope

`agent-bridge-temote` (Agent Remote Control) is a Node.js CLI app installed globally via `npm install -g agent-remote-control`. It lets a developer launch and manage local AI coding agents (Claude Code, Gemini CLI, OpenCode, Codex) from a browser UI. For each agent session the app spawns the agent as a PTY process, captures the remote URL it prints to stdout, and surfaces it in the web interface via WebSocket.

Implementation has begun following the Phase 1 plan in `docs/superpowers/plans/2026-05-29-arc-phase1.md`.

---

## Phase Priority

**Phase 1 = Claude Code only.** Do not implement Gemini, OpenCode, Codex, or any other provider until Phase 1 is fully working and tested. Stubs for other providers are allowed (visible-and-disabled in UI, `enabled: false` in the catalog) but must contain no real logic. See `docs/REQUIMENT.md` §Delivery Phases for the full boundary.

---

## Authoritative Documents

Source of truth, in priority order. When documents conflict, the higher entry wins:

| Document | Purpose | When to read |
|---|---|---|
| [docs/REQUIMENT.md](docs/REQUIMENT.md) | All functional and non-functional requirements, CLI surface, API routes, config reference | Before any task |
| [docs/DESIGN.md](docs/DESIGN.md) | Frontend component tree, page layouts, design tokens, state management, component specs | Before any UI task |
| [docs/superpowers/plans/2026-05-29-arc-phase1.md](docs/superpowers/plans/2026-05-29-arc-phase1.md) | Full Phase 1 implementation plan with code for every file | During implementation |
| [docs/superpowers/specs/2026-05-29-arc-design.md](docs/superpowers/specs/2026-05-29-arc-design.md) | Architecture decision summary and key constraints | When making architectural choices |
| [CONTEXT.md](CONTEXT.md) | Verified domain terms, ground truth for link patterns | When touching session/link logic |

The filename `docs/REQUIMENT.md` matches this project's convention — do not rename it.

---

## Build, Run, Test

All commands assume you are at the repo root. Source does not exist yet until Task A1 is complete; commands are from the plan and will work once scaffolded.

---

## Publishing to npm

The package name is `agent-remote-control`. The `prepublishOnly` hook runs `npm run build` automatically.

**One-time setup:**
```bash
npm login   # authenticate with your npm account
```

**Preview what will be published (dry run):**
```bash
npm pack --dry-run
# Confirm dist/, README.md, LICENSE appear — no source or test files
```

**Publish:**
```bash
npm publish
```

**Bump version then publish:**
```bash
npm version patch   # 0.1.0 → 0.1.1  (bug fixes)
npm version minor   # 0.1.0 → 0.2.0  (new features, backward-compatible)
npm version major   # 0.1.0 → 1.0.0  (breaking changes)
npm publish
```

**What gets included** (controlled by `files` in `package.json`):
```
dist/         compiled server + CLI + bundled web UI
README.md
LICENSE
```

**What is intentionally excluded:** `src/`, `tests/`, `docs/`, `node_modules/`, config dot-files, scratch scripts.

**Note on native modules:** `node-pty` is a native addon. It ships prebuilt binaries via `node-pre-gyp`; users without a matching prebuilt will need a C++ build toolchain. `arc install` smoke-tests `node-pty` on first run and prints a per-OS remediation message if it fails (ADR-0001).

---

```bash
# Install dependencies (after package.json is created in Task A1)
npm install

# Development (two processes via concurrently)
npm run dev           # Fastify on :4096 + Vite HMR on :5173

# Individual processes
npm run dev:server    # tsx watch src/server/index.ts
npm run dev:web       # vite

# Production build
npm run build         # build:server (tsup) + build:web (vite)
npm run build:server  # tsup → dist/bin/ and dist/server/
npm run build:web     # vite build → dist/web/

# Tests
npm test              # vitest run (all tests)
npm run test:watch    # vitest (watch mode)

# Single test file
npm test -- tests/core/persistence.test.ts

# Type-check without emit
npx tsc --noEmit
```

**Dev mode proxy:** Vite proxies `/api/*` and `/ws` to `http://localhost:4096`, so the SPA always talks to the real backend regardless of which port the browser hits.

**CLI (before build):**
```bash
npx tsx bin/arc.ts help
npx tsx bin/arc.ts config
npx tsx bin/arc.ts start --port 5050 --log-level debug
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5 (strict mode) |
| Backend | Node.js 20 / Fastify 4 |
| Process spawning | **node-pty** (real PTY required — see PTY Rule below) |
| Frontend | React 18 + Vite + TailwindCSS v3 |
| State management | Zustand 4 |
| Realtime | WebSocket (`ws` library) |
| Persistence | JSON files at `~/.agent-remote-control/` |
| Auth | bcryptjs (password hashing) + HMAC-SHA256 session tokens |
| CLI | commander 12 |
| Logger | pino |
| Testing | vitest |
| Build | tsup (server) + vite (web) |
| Process management | PM2 (manages Agent Remote Control itself, not agent sessions) |

---

## File Structure

```
agent-bridge-temote/
├── package.json
├── tsconfig.json              # used by Vite (SPA)
├── tsconfig.server.json       # used by tsup (backend + CLI)
├── tsup.config.ts
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.ts
├── bin/
│   └── arc.ts        # thin CLI shim (shebang: #!/usr/bin/env node)
├── src/
│   ├── types.ts               # shared: Project, Session, AgentDefinition, AppConfig, WsEvent
│   ├── cli/
│   │   └── index.ts           # commander root + all subcommands
│   ├── server/
│   │   ├── index.ts           # Fastify bootstrap, plugin registration, start()
│   │   ├── core/
│   │   │   ├── config.ts      # CONFIG_DEFAULTS, loadConfig(), saveConfig(), validateConfig(), mergeConfig()
│   │   │   ├── persistence.ts # atomicWrite(), readJson(), ensureDir()
│   │   │   ├── auth.ts        # hashPassword(), verifyPassword(), signSession(), verifySession(), generateSecret()
│   │   │   ├── csrf.ts        # generateCsrfToken(), verifyCsrfToken()
│   │   │   ├── rate-limit.ts  # RateLimiter class (in-memory, per-IP, sliding window)
│   │   │   └── logger.ts      # createLogger(level) → pino instance
│   │   ├── middleware/
│   │   │   ├── session-auth.ts  # makeSessionAuthHook(secret) → Fastify preHandler
│   │   │   └── csrf-check.ts    # makeCsrfCheckHook() → Fastify preHandler
│   │   ├── routes/
│   │   │   ├── auth.ts        # POST /api/auth/login, /logout; GET /api/auth/csrf
│   │   │   ├── projects.ts    # CRUD /api/projects
│   │   │   ├── agents.ts      # GET /api/agents
│   │   │   ├── sessions.ts    # /api/sessions/*
│   │   │   └── config.ts      # GET/PUT /api/config, GET /healthz
│   │   ├── sessions/
│   │   │   ├── manager.ts     # SessionManager class
│   │   │   ├── link-extractor.ts # extractLink(line, pattern): string | null
│   │   │   └── agent-catalog.ts  # BUILT_IN_AGENTS, resolveAgent(), resolveCommand()
│   │   └── ws/
│   │       └── index.ts       # WebSocket upgrade, cookie auth, broadcast()
│   └── web/                   # React SPA (Vite root: src/web/)
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── theme.css          # CSS custom properties (design tokens)
│       ├── pages/             # LoginPage, Dashboard, SettingsPage
│       ├── components/        # SessionCard, ProjectCard, modals, drawers, ui primitives
│       ├── stores/            # Zustand slices: sessions, projects, ui, config, ws
│       └── lib/
│           ├── api.ts         # fetch wrapper (injects X-CSRF-Token from store)
│           └── ws.ts          # useWebSocket hook → dispatches to Zustand
├── tests/
│   ├── core/                  # persistence, config, auth, csrf tests
│   ├── sessions/              # link-extractor, manager tests
│   └── routes/                # auth, projects route tests (Fastify inject)
└── dist/                      # tsup + vite build output
    ├── bin/arc.js
    ├── server/
    └── web/
```

---

## Hard Rules — never violate

These invariants are derived directly from [docs/REQUIMENT.md](docs/REQUIMENT.md).

| # | Rule | Source | Why |
|---|---|---|---|
| H1 | If the configured port is busy, **fail with a clear error message**. Never kill or signal the holding process. | NFR1 | Could destroy running user work. |
| H2 | When `host=0.0.0.0`, **refuse to start** unless `password` is set. Print a setup guide. | NFR3 | App is publicly reachable; no password means open access. |
| H3 | Print a **red warning banner** in the CLI on start whenever `host=0.0.0.0`. Show a **persistent warning banner** in the web UI. | NFR3 | User must always know when the app is network-exposed. |
| H4 | Store password as a **bcrypt hash** — never plaintext. | NFR3 | — |
| H5 | All API routes and WebSocket connections require a valid **session cookie** (`rb_session`). Only `POST /api/auth/login` and `GET /healthz` are public. | NFR3 | No unauthenticated access to projects, sessions, config, or logs. |
| H6 | All mutating requests (POST / PUT / DELETE) require a **CSRF token** in `X-CSRF-Token` header, verified against the `rb_csrf` cookie. | NFR3 | Prevents CSRF against the local server. |
| H7 | `GET /api/config` **never returns** `password` or `sessionSecret`. Destructure them out before serialising. | NFR3 | Secrets must not leak to the frontend. |
| H8 | Agent `command` is sourced **only** from the built-in agent catalog or `config.json` — never from the raw client request payload. | FR3, NFR3 | Prevents arbitrary command injection from the browser. |
| H9 | Project `path` is **validated server-side** as an existing absolute directory (`fs.stat` + `isDirectory()`) before saving or using as `cwd`. | FR1, FR3, NFR3 | Prevents spawning agents in invalid directories. |
| H10 | App may only terminate agent processes it spawned (tracked by PID in `sessions.json`). node-pty's `child.kill()` handles SIGTERM/SIGKILL. Never signal unrelated OS processes. | FR5 | Could kill unrelated user work. |
| H11 | Config dir permissions (Unix): directory `0700`, files `0600`, written atomically via temp + `fs.rename`. Windows: attempt `icacls` owner-only ACL; log a warning if it fails, do not abort startup. | NFR3 | Protects config, secrets, session data from other OS users. |
| H12 | Login endpoint is **rate-limited**: max 10 attempts / minute per IP. | NFR3 | Prevents brute-force. |
| H13 | Agent Remote Control **never stores or extracts** credentials or auth tokens belonging to AI services. The user manages their own AI service auth. | Design decision | Scope boundary — Agent Remote Control is a launcher, not an auth proxy. |
| H14 | `linkPattern` regex match runs against **each stdout line individually** via `extractLink()`. Never execute or eval agent output. | FR4 | Agent output is untrusted. |
| H15 | A Project **cannot be deleted** while any of its sessions is `launching` or `running` — `DELETE /api/projects/:id` returns `409 project_in_use`. Stop the sessions first. | FR1, FR5 | A live session must never reference a vanished Project (Restart would 404). Symmetric with `removeSession()`'s running-guard. |

---

## Critical Implementation Invariants

These are non-obvious rules derived from the implementation plan. Violating them produces silent failures or security issues.

**PTY spawn — not child_process:**
Agents like Claude Code detect TTY at startup. Without a real TTY they enter `--print` mode and exit immediately. Use `node-pty.spawn()` everywhere agents are launched — never `child_process.spawn()` or `execa`. The plan's `SessionManager.launch()` uses node-pty.

**Trust prompt auto-accept:**
Claude Code prompts "Is this a project you trust? (1. Yes / 2. No)" on first launch. `SessionManager.launch()` detects this in the PTY `onData` stream (regex `/trust this folder|1\.\s*Yes.*trust/i`) and writes `\r` to the PTY. Without this the session hangs forever in `launching` state.

**ANSI stripping before log storage and link extraction:**
node-pty delivers raw terminal output including ANSI escape sequences. Strip them before storing log lines and before running `extractLink()`. Use `/\x1b\[[0-9;?=>]*[a-zA-Z]/g`. The clean line is what gets emitted as `session.log` WS events and matched against `linkPattern`.

**Session logs are ephemeral — not persisted, and never inside `session.updated`:**
`atomicWrite` to `sessions.json` always strips `logs: []`. In-memory only, bounded to `keepSessionLogsLines` (default 500). Do not attempt to persist or restore logs across restarts. Likewise, `SessionManager.updateSession()` strips `logs` from the `session.updated` WS payload — logs flow **only** via `session.log` events plus the initial `GET /api/sessions` snapshot. Re-sending logs in `session.updated` would clobber the client's appended buffer (two writers, one field). `WsEvent`'s `session.updated` payload type is `Omit<Session, 'logs'>`.

**PID recovery on startup:**
`SessionManager.loadAndRecover()` must be called before the server accepts requests. Sessions in `launching` or `running` state are checked via `process.kill(pid, 0)`. Dead PIDs → `stopped`. This prevents sessions.json from having ghost `running` entries after a restart.

**Claude link pattern — verified against v2.1.156:**
The exact stdout line is:
```
/remote-control is active · Continue here, on your phone, or at  https://claude.ai/code/session_<ULID>
```
Correct pattern: `https://claude\.ai/code/session_[\w]+`
- `session_` with underscore (not `sessions/`)
- ID is a ULID (26 chars, alphanumeric, no hyphens)

Re-verify on each major Claude Code version bump. See [CONTEXT.md](CONTEXT.md).

**CSRF cookie is non-httpOnly:**
`rb_session` cookie: `httpOnly: true`, `sameSite: strict`. `rb_csrf` cookie: `httpOnly: false`, `sameSite: strict`. The CSRF cookie must be readable by JavaScript so the frontend can include it in `X-CSRF-Token`. On every page refresh, `GET /api/auth/csrf` (protected by session cookie) issues a fresh CSRF token pair.

**`GET /api/config` exclusion list:**
```ts
const { password: _p, sessionSecret: _s, ...safe } = cfg
```
Only these two fields are excluded. All other config is safe to return.

**`PUT /api/config` hashes a `password` field — never stores plaintext:**
A `password` arriving over the API is plaintext; the route bcrypt-hashes it before saving, exactly like the CLI's `config set password` (H4). An empty/absent `password` is dropped, never overwriting an existing hash; `sessionSecret` is never accepted from the client. Without this, plaintext lands in `config.json` and the bcrypt-compare login path can never match it — locking the user out.

**Trust boundary — the authenticated user is fully trusted (ADR-0003):**
The threat model is an unauthenticated network party, not the logged-in user. Session/CSRF auth and H8 keep *outsiders* out; they do not constrain the user. Setting an arbitrary `agents.*.command` via `config.json` or `PUT /api/config` is an **intended** power-user capability — H8 only forbids taking the command from the raw `/api/sessions/launch` payload.

**Graceful shutdown kills every spawned agent (ADR-0002):**
On SIGINT/SIGTERM the bootstrap `await`s `SessionManager.killAll()` before `fastify.close()`. `killAll()` SIGTERMs every tracked PTY, awaits exits with a ~1s bound, then SIGKILLs stragglers — only processes we spawned (PTY handles in `this.processes`), never a bare PID (H10). `arc install` registers PM2 with `--kill-timeout 6000` so this drain finishes before PM2 force-kills the daemon.

**`arc install` smoke-tests node-pty (ADR-0001):**
node-pty is a native module with no JS fallback. `install` does `await import('node-pty')` and, on failure, prints a per-OS build-toolchain remediation message (not a node-gyp wall-of-text) ending in the `arc help` pointer, then exits non-zero.

**resolveCommand on Windows:**
`node-pty` does not resolve `.cmd` shims for npm global-installed executables on Windows. `resolveCommand(command)` appends `.cmd` if the platform is win32 and the command has no extension and no path separators.

**`TERM=xterm-256color` injected into every agent env:**
Required so agents (which inherit the PTY terminal type) initialise correctly.

**Agent catalog is the single source of truth:**
Agent IDs (`claude`, `gemini`, `opencode`, `codex`) must match across `BUILT_IN_AGENTS`, API responses, and config validation. Never hardcode agent names outside `agent-catalog.ts`.

**AI Provider Session Resuming & Session-ID Support:**
For future AI providers (e.g., Codex, OpenCode, Gemini CLI in Phase 2) that support session restoration, reactivation/restarting should support passing a `resume` command/flag and the corresponding `session-id` (e.g., `codex resume <session-id>`) if the provider requires it to restore context/session state, rather than just spawning a clean, empty session. Keep this architecture in mind when integrating future AI providers.

**Error response envelope:**
All API responses use:
```ts
{ ok: true, data: T }            // success
{ ok: false, error: { code: string, message: string } }  // failure
```
Error codes are short camelCase strings: `auth_required`, `csrf_missing`, `rate_limited`, `invalid_path`, `not_found`, `bad_request`, `project_in_use`, `session_active`, `max_sessions_reached`, `invalid_config`.

**Error messages always include `arc help` pointer:**
Validation errors from `validateConfig()` and CLI bad-arg handlers must end with `Run 'arc help' for usage.` — no dead-end errors.

**WebSocket auth at upgrade time:**
The WS upgrade handler reads the `rb_session` cookie from the HTTP upgrade request and verifies it before accepting the connection. No second auth exchange over the WebSocket protocol.

**WebSocket events — exactly two types:**
```ts
{ type: 'session.updated'; payload: Session }
{ type: 'session.log';     payload: { sessionId: string; line: string } }
```
Do not add new event types without updating both `docs/REQUIMENT.md` and `src/web/lib/ws.ts`.

---

## Persistence Layout

```
~/.agent-remote-control/         (dir mode 0700)
├── config.json          (mode 0600) — AppConfig
├── projects.json        (mode 0600) — Project[]
└── sessions.json        (mode 0600) — Session[] (logs always [] on disk)
```

Windows: `%APPDATA%\arc\`

All writes use `atomicWrite()` (temp file + `fs.rename`).

---

## REST API Surface

All routes except `/api/auth/login` and `/healthz` require `rb_session` cookie. All mutating routes (POST/PUT/DELETE) additionally require `X-CSRF-Token` header.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | public | Rate-limited 10/min per IP |
| POST | `/api/auth/logout` | session | Clears cookies |
| GET | `/api/auth/csrf` | session | Issues fresh CSRF token on page refresh |
| GET | `/api/projects` | session | |
| POST | `/api/projects` | session + CSRF | Validates path server-side |
| PUT | `/api/projects/:id` | session + CSRF | |
| DELETE | `/api/projects/:id` | session + CSRF | 409 `project_in_use` if a session is launching/running (H15) |
| GET | `/api/agents` | session | Returns catalog with enabled flags |
| GET | `/api/sessions` | session | |
| POST | `/api/sessions/launch` | session + CSRF | Body: `{ projectId, agentId }` |
| POST | `/api/sessions/:id/stop` | session + CSRF | |
| POST | `/api/sessions/:id/restart` | session + CSRF | |
| DELETE | `/api/sessions/:id` | session + CSRF | Only allowed if stopped/failed |
| GET | `/api/config` | session | Strips `password`, `sessionSecret` |
| PUT | `/api/config` | session + CSRF | |
| GET | `/healthz` | public | |

WebSocket: `ws://<host>:<port>/ws` — cookie auth on upgrade

---

## Shared Types (`src/types.ts`)

```ts
type SessionState = 'launching' | 'running' | 'stopped' | 'failed'
type LogLevel = 'debug' | 'info' | 'warn' | 'error'
```

These types are shared between server and web. Import from `../../types.js` (server) or `@/types` (web with Vite alias).

---

## Testing

| Type | Location | Tool | Notes |
|------|----------|------|-------|
| Unit | `tests/core/` | vitest | Pure functions, no filesystem |
| Integration | `tests/core/persistence.test.ts` | vitest | Uses real tmpdir; checks mode 0700/0600 |
| Route | `tests/routes/` | vitest + Fastify inject | Full Fastify instance, no network |
| Session | `tests/sessions/` | vitest | Manager uses real tmpdir; no actual PTY spawn |
| E2E | `tests/e2e/` | vitest + ws + node-pty | Real server on an ephemeral port; real PTY via `tests/fixtures/fake-agent.mjs`; full login→launch→link→stop/restart/delete flow. See [docs/E2E-TEST-PLAN.md](docs/E2E-TEST-PLAN.md) |

Tests run in the `forks` pool with `$HOME` redirected to a sandbox (`tests/setup.ts`) so they never touch the real `~/.agent-remote-control` (modules resolve the config dir from `os.homedir()` at import time).

**Run a single test file:**
```bash
npm test -- tests/core/auth.test.ts
```

**First-time gotcha for route tests:** Route tests create a full Fastify instance in `beforeAll` and call `.ready()`. Forgetting `await fastify.ready()` causes flaky failures from unregistered routes.

**Manager tests do not spawn real agents.** They test state transitions, persistence, and PID recovery logic only. The node-pty `spawn` call in `manager.ts` is not exercised by unit tests.

---

## Config Defaults

```ts
{
  port: 4096,
  host: '0.0.0.0',
  password: '',            // bcrypt hash; '' = not set
  sessionSecret: '',       // auto-generated on install
  sessionTTL: 86400,       // seconds
  linkExtractTimeout: 30,  // seconds before marking failed
  maxConcurrentSessions: 10,
  keepSessionLogsLines: 500,
  agents: {},              // user overrides merged on top of BUILT_IN_AGENTS
  globalEnv: {},
  logLevel: 'info'
}
```

`validateConfig()` enforces: valid port range (1–65535), valid logLevel, and password required when `host !== '127.0.0.1'`. It returns `string[]` of error messages (empty = valid).

---

## Workflow Pipeline

Every sprint or task follows the same pipeline. Each arrow is a hand-off; do not skip.

```
pick task → write plan → branch → execute plan → verify → review → finish
            writing-plans         executing-plans  verif-   request-/
                                  + TDD per task   before-  receive-code-
                                  + brainstorm     comple-  review
                                    when ambiguous tion
                                  + debug
                                    when stuck
```

### Step 1 — Pick the next task

1. Read [docs/REQUIMENT.md](docs/REQUIMENT.md) end to end. Note which FR/NFR sections apply.
2. Check the Phase 1 plan for the next unchecked task.
3. Confirm dependencies from prior tasks are complete.

### Step 2 — Write an implementation plan

For tasks not already covered by the Phase 1 plan, invoke **`superpowers:writing-plans`**. Save to `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`.

### Step 3 — Branch

Branch name: `feat/<short-topic>` or `fix/<short-topic>`.

### Step 4 — Execute the plan

Invoke **`superpowers:executing-plans`** with review checkpoints every 3–5 tasks.

For each task:
1. **If scope is ambiguous**, invoke **`superpowers:brainstorming`** before writing any code.
2. Otherwise, invoke **`superpowers:test-driven-development`**: failing test first, then minimum implementation, then refactor.
3. **If stuck on a bug**, invoke **`superpowers:systematic-debugging`** — do not patch symptoms.

### Step 5 — Verify

Invoke **`superpowers:verification-before-completion`** before claiming done.
Produce evidence (command output, test run) for every requirement the task claims to satisfy.

### Step 6 — Review

Invoke **`superpowers:requesting-code-review`** before merge.
For review responses, follow **`superpowers:receiving-code-review`**.

### Step 7 — Finish

Invoke **`superpowers:finishing-a-development-branch`** to choose integration path.

---

## Key Conventions

**Config defaults:** Every config key must have a default in `CONFIG_DEFAULTS` (`src/server/core/config.ts`). A user running `arc start` with zero config (other than password, which blocks start when host=0.0.0.0) must get a working server.

**`arc start` inline flags:** `arc start` accepts `--port`, `--host`, `--password`, `--log-level`, `--session-ttl`, `--max-sessions`, `--keep-logs`, and `--link-timeout`. When any flag is present the CLI merges the new values into the current `config.json`, validates, saves, then restarts the PM2 process (or starts it if not yet registered). Password values are bcrypt-hashed before saving (H4). This is an alias for the two-step `arc config set <key> <value>` + `arc restart` workflow.

**Cross-platform process spawning:** Use `node-pty` — not `child_process.spawn`, not `execa`, not `cross-spawn`. On Windows, call `resolveCommand(command)` from `agent-catalog.ts` to append `.cmd` before passing to node-pty.

**Browser open:** Use the `open` npm package. It wraps `xdg-open` (Linux), `open` (macOS), `start` (Windows) automatically.

**File paths:** Always use `path.join()` / `path.resolve()`. Never string concatenation with `/` or `\`.

**Atomic writes:** Write to a `.tmp-<hex>` file then `fs.rename()`. This is atomic on same-drive on all platforms including Windows NTFS.

**Passwords:** Never log, print, or include the raw password in any error message, stack trace, or API response. Log only `"[password set]"` or `"[password missing]"`.

**Session state machine:** Do not add intermediate states without updating the spec in `docs/REQUIMENT.md`. Only: `launching | running | stopped | failed`.

**Frontend styling:** Design tokens live in CSS custom properties in `src/web/theme.css`. Use Tailwind utilities for layout and spacing only. Never use Tailwind color utilities (`text-blue-500`) directly — always reference `--color-*` tokens. See [docs/DESIGN.md](docs/DESIGN.md) for the full token set.

---

## Pointers

| Document | When to read |
|---|---|
| [docs/REQUIMENT.md](docs/REQUIMENT.md) | Before any task — FR/NFR, CLI surface, API, config |
| [docs/DESIGN.md](docs/DESIGN.md) | Before any UI task — component specs, design tokens, ASCII mockups |
| [docs/superpowers/plans/2026-05-29-arc-phase1.md](docs/superpowers/plans/2026-05-29-arc-phase1.md) | During implementation — full code for every Sprint A–F task |
| [CONTEXT.md](CONTEXT.md) | When touching link extraction or session logic — verified domain terms |

> Docs lag code; trust source when there's a conflict.
