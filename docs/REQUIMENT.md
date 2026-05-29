# RemoteBridge — System Requirements

## Goal

RemoteBridge is a Node.js application installed globally via npm that lets a
developer launch and manage multiple local AI coding agents (Claude Code,
Gemini CLI, OpenCode, Codex, etc.) from a browser UI. For each agent session,
RemoteBridge captures the remote control link the agent prints to stdout and
surfaces it in the web interface.

The user clicks **Launch**, waits a few seconds, then clicks **Open Remote
Control** — that is the entire interaction.

## Delivery Phases

### Phase 1 — Claude Code (current focus)

Deliver a **fully working** RemoteBridge with Claude Code as the only active
provider. Every feature (project management, session lifecycle, link extraction,
stop/restart, logs, auth, config) must work end-to-end with Claude Code before
any other provider is added.

Phase 1 MUST include:
- Full CLI surface (`install`, `start`, `stop`, `restart`, `status`, `open`, `logs`, `config`, `help`).
- Complete auth flow (password, session cookie, CSRF).
- Project CRUD.
- Claude Code agent: launch with `claude --remote-control`, capture link from stdout, display in UI.
- Session lifecycle: `launching → running → stopped / failed` with stop and restart.
- Live logs drawer (stdout streaming via WebSocket).
- Settings page.
- All Hard Rules H1–H14 enforced.

Phase 1 MUST NOT include:
- Gemini CLI, OpenCode, Codex, or any other provider implementation (stubs only — visible and disabled in UI).
- Docker-based session isolation.
- Multi-user auth.

### Phase 2 — Additional Providers

After Phase 1 is stable and fully tested, add providers one at a time:
Gemini CLI → OpenCode → Codex → others.

Each provider follows the same adapter interface established in Phase 1.
Adding a provider must not require changes to the core session manager or UI
beyond registering the new agent in the catalog.

---

## Users & Use Case

Single user (the developer). Runs on the developer's local machine — Linux,
macOS, or Windows. Accessible from any browser on the LAN or internet
(`0.0.0.0` by default). No cloud relay. No multi-tenancy. Auth is one
app-level password.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Node.js 20+ / Fastify |
| Frontend | React 18 + Vite + TailwindCSS (served as static files by Fastify) |
| Realtime | WebSocket (`ws` library) |
| Persistence | JSON files at the platform config dir (see Configuration Reference) |
| Process management | PM2 (external — manages RemoteBridge itself, not agent sessions) |
| Distribution | `npm install -g remotebridge` |
| Cross-platform open | `open` (macOS) / `xdg-open` (Linux) / `start` (Windows) — via `open` npm package |

---

## CLI Commands

```bash
remotebridge help                         # show all commands and options
remotebridge install                      # setup PM2, generate config, prompt for password
remotebridge start                        # start server (via PM2 if installed)
remotebridge stop                         # stop server
remotebridge restart                      # restart server
remotebridge status                       # show process state, port, and web URL
remotebridge open                         # open web UI in default browser
remotebridge logs                         # tail PM2 logs (stdout + stderr)
remotebridge config                       # display current config (password hidden)
remotebridge config set <key> <value>     # update a single config value
remotebridge config reset                 # reset config to factory defaults
```

**Error UX:** Every command prints a usage guide when called incorrectly.
Unknown or misspelled options display the closest valid option name, the
expected type, and a pointer to `remotebridge help`.

---

## Functional Requirements

### FR1. Project Management

- User can add, edit, delete, and list projects via the web UI.
- A project **cannot be deleted while it has a launching/running session** — the API
  returns `409 project_in_use`; the user must stop those sessions first (H15).
- Each project stores:
  - `name` — display name
  - `path` — absolute filesystem path (validated to exist on save)
  - `env` — optional per-project environment variables (key/value)
  - `lastAgentId` — agent used most recently
- Project path is validated to be an existing absolute directory before saving.

### FR2. Agent Catalog

- Built-in agents: **Claude Code**, **Gemini CLI**, **OpenCode**, **Codex**.
- Each built-in agent defines:
  - `command` — executable name
  - `args` — default argument list
  - `env` — default env vars to inject
  - `linkPattern` — regex to detect the remote URL in stdout
- Users can override any field per agent in `config.json`.
- Users can add custom agents in config.

### FR3. Agent Orchestration

- Accept `{ projectId, agentId }` from the UI to launch a new session.
- Merge environments in order: `process.env` → `config.globalEnv` →
  `project.env` → `agent.env` — later values win.
- Set `cwd` to the project's registered absolute path.
- Spawn the agent as a background OS process (non-blocking — HTTP response returns immediately). On shutdown (SIGINT/SIGTERM, e.g. PM2 stop/restart) RemoteBridge kills every agent it spawned before exiting, so no agent is left orphaned. See ADR-0002.
- Use `node-pty` (not `child_process.spawn`) to provide a real PTY. Claude Code and similar agents check for TTY at startup and refuse to run without one — without a PTY they immediately exit with an error.
- Agent command is sourced **only** from the built-in catalog or user config —
  never from the raw client request payload.

### FR4. Remote Link Extraction

- Read the agent's PTY output as a single merged stream (node-pty combines stdout
  and stderr), split into lines.
- Match each line against the agent's `linkPattern` regex.
- On first match:
  - Update session state to `running`.
  - Store the extracted URL in the session record.
  - Broadcast `session.updated` WebSocket event.
- If no link appears within `linkExtractTimeout` seconds, mark session `failed`
  and broadcast the update.

**Built-in link patterns (all configurable):**

| Agent | Default Pattern |
|-------|----------------|
| claude | `https://claude\.ai/code/session_[\w]+` |
| gemini | `https?://[\w.-]+:\d+/[\w?=&-]*` |
| opencode | `http://127\.0\.0\.1:\d+` |
| generic | `https?://[^\s]+` (fallback for unknown agents) |

### FR5. Session Management

- Session lifecycle state machine:

  ```
  LAUNCHING → RUNNING → STOPPED
            ↓                ↑
          FAILED ← timeout / crash
  ```

- User can **Stop** a running session. On Unix: SIGTERM → SIGKILL after grace
  period. On Windows: `taskkill /PID <pid>` → `/F` after grace period.
- User can **Restart** a stopped/failed session (re-spawns with same config).
- User can **Delete** a stopped/failed session record.
- Sessions do **not** survive a RemoteBridge restart: PTY handles are lost, so on
  startup every prior `launching`/`running` session is marked `stopped`. RemoteBridge
  never kills a stale PID directly (PID-reuse safety — see H1/H10/ADR-0002); it only
  logs a warning if the old PID still appears alive.

---

## Non-Functional Requirements

### NFR1. Network & Binding

- **Default bind:** `0.0.0.0`, port `4096`.
- Both `host` and `port` are configurable via `config.json` or
  `remotebridge config set`.
- If the configured port is already in use, the app fails with a clear error
  message. It **must not** kill the existing process holding the port.

### NFR2. Performance

- Time from "Launch" click to remote link appearing in browser:
  under 7 seconds (dependent on agent boot time, not RemoteBridge overhead).
- All session spawning is async — the HTTP response returns immediately with
  the new session ID; state updates flow through WebSocket.

### NFR3. Security

- **Password required** to start when `host=0.0.0.0` — app refuses to start
  without one and prints a setup guide.
- Password stored as **bcrypt hash** in `config.json`.
- Login issues a signed **session cookie** (httpOnly, sameSite=Strict).
- All API routes and WebSocket connections require a valid session cookie,
  except `POST /api/auth/login` and `GET /healthz`.
- All mutating requests (POST / PUT / DELETE) require a **CSRF token** in the
  `X-CSRF-Token` header.
- Project `path` validated server-side as an existing absolute directory.
- Agent command sourced exclusively from built-in catalog or config —
  not from client payload.
- Config directory permissions:
  - **Unix (Linux / macOS):** directory mode `0700`, all files `0600`, written
    atomically via temp file + `fs.rename`.
  - **Windows:** directory created with restricted ACL (owner-only via
    `icacls`). If `icacls` is unavailable, log a warning and continue — do
    not fail startup.
- `GET /api/config` **never returns** `password` or `sessionSecret`.
- Login endpoint: rate-limited to 10 attempts / minute per IP.
- CLI prints a **red warning banner** on start when bound to `0.0.0.0`.
- Web UI shows a **persistent warning banner** when connected to a
  `0.0.0.0`-bound server.

### NFR4. Configuration

- All options have sensible defaults — zero config required to run locally.
- Invalid or unknown config keys print a clear error with the correct key name,
  expected type, and `remotebridge help` pointer.

### NFR5. Logging

- Structured log output with configurable level (`debug | info | warn | error`).
- Per-session stdout captured and kept in memory (last N lines, controlled by
  `keepSessionLogsLines`).
- PM2 manages app-level log rotation and file output.

---

## Configuration Reference

### Config directory (platform-specific)

| Platform | Path |
|----------|------|
| Linux | `~/.remotebridge/` |
| macOS | `~/.remotebridge/` |
| Windows | `%APPDATA%\remotebridge\` |

Resolved at runtime via `os.homedir()` on Unix and `process.env.APPDATA` on
Windows. The directory is created on first run if it does not exist.

### `config.json`

```jsonc
{
  // Network
  "port": 4096,
  "host": "0.0.0.0",

  // Auth — password required if host is not 127.0.0.1
  "password": "",
  "sessionSecret": "<auto-generated on install>",
  "sessionTTL": 86400,           // seconds, default 24h

  // Session behavior
  "linkExtractTimeout": 30,      // seconds to wait for link before marking failed
  "maxConcurrentSessions": 10,
  "keepSessionLogsLines": 500,   // lines of agent stdout kept per session

  // Agent overrides (merged on top of built-in defaults)
  "agents": {
    "claude": {
      "command": "claude",
      "args": ["--remote-control"],
      "env": {},
      "linkPattern": "https://claude\\.ai/code/session_[\\w]+"
    },
    "gemini": {
      "command": "gemini",
      "args": ["--remote"],
      "env": {},
      "linkPattern": "https?://[\\w.-]+:\\d+/[\\w?=&-]*"
    },
    "opencode": {
      "command": "opencode",
      "args": ["serve"],
      "env": {},
      "linkPattern": "http://127\\.0\\.0\\.1:\\d+"
    },
    "codex": {
      "command": "codex",
      "args": [],
      "env": {},
      "linkPattern": "https?://[^\\s]+"
    }
  },

  // Injected into every agent session
  "globalEnv": {},

  // Logging
  "logLevel": "info"
}
```

---

## REST API Surface

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/csrf                  (session required — issues fresh CSRF token on page load)

GET    /api/projects
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id

GET    /api/agents

GET    /api/sessions
POST   /api/sessions/launch          { projectId, agentId }
POST   /api/sessions/:id/stop
POST   /api/sessions/:id/restart
DELETE /api/sessions/:id

GET    /api/config                   (password and sessionSecret omitted)
PUT    /api/config

GET    /healthz
```

WebSocket: `ws://<host>:<port>/ws` (cookie auth on upgrade)

---

## WebSocket Events (server → client)

```ts
{ type: "session.updated", payload: Session }
{ type: "session.log",     payload: { sessionId: string, line: string } }
```

---

## Core User Flow

1. `npm install -g remotebridge && remotebridge install`
2. Open `http://localhost:4096` (or `remotebridge open`).
3. Login with password.
4. Dashboard: registered projects on the left, active sessions in the main area.
5. Click a project → select an agent → click **Launch**.
6. Session card shows **Launching…** with a progress indicator.
7. Link extracted → card shows **Open Remote Control** button.
8. Click → new browser tab opens the agent's remote URL.
9. When done → click **Stop** on the session card.

---

## Cross-Platform Notes

### Path handling
- Always use `path.join()` / `path.resolve()` — never string concatenation with `/` or `\`.
- Project `path` field stores the OS-native absolute path as entered by the user.
  Validate with `fs.stat()`, not string pattern matching.

### Process spawning
- Spawn agents via `node-pty` (a real PTY) on all platforms — agents like Claude Code
  check for a TTY at startup and refuse to run without one. See ADR-0001.
- On Windows, agent executables installed via npm may require the `.cmd` shim
  (e.g. `claude.cmd`). Resolve the correct executable name with `resolveCommand()`
  before spawning — node-pty does not do this automatically.

### Browser open (`remotebridge open`)
- Use the `open` npm package — it wraps `open` (macOS), `xdg-open` (Linux),
  and `start` (Windows) automatically.

### Process termination (`remotebridge stop` / session Stop)
- Use the node-pty process handle: `child.kill('SIGTERM')`, then `child.kill('SIGKILL')`
  after a grace period. node-pty maps these to the correct Windows call internally.
- Only terminate agent processes RemoteBridge spawned (tracked by the PtyProcess handle
  and PID in sessions.json). Never signal unrelated OS processes.

### File permissions
- Unix only: `fs.chmod(path, 0o700)` for config dir, `0o600` for files.
- Windows: attempt `icacls` to restrict to current user; log a warning if it
  fails but do not abort startup.
- Atomic writes: write to a `.tmp` file then `fs.rename()` — works on all
  platforms (same-drive rename is atomic on Windows NTFS too).

### npm bin entries (`package.json`)
```jsonc
{
  "bin": {
    "remotebridge": "./bin/remotebridge.js"
  }
}
```
npm automatically generates a `.cmd` wrapper on Windows and a symlink on
Unix when installed globally — no separate shell script files needed. The
entry point must be a `.js` file with a `#!/usr/bin/env node` shebang.
