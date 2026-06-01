# Agent Remote Control

Agent Remote Control is a local Node.js app that launches AI coding agents from a browser UI and surfaces the remote-control URL each agent prints to its terminal output.

Phase 1 is Claude Code only: Agent Remote Control launches `claude --remote-control`, captures the `https://claude.ai/code/session_...` link from the PTY stream, and shows it in the web app. Gemini CLI, OpenCode, and Codex are present only as disabled catalog stubs until Phase 1 is fully working.

## What It Does

- Registers local projects by absolute filesystem path.
- Launches a Claude Code session for a selected project.
- Uses a real PTY via `node-pty`, which Claude Code requires.
- Auto-detects Claude's remote-control link from terminal output.
- Streams session logs and state changes to the browser over WebSocket.
- Lets you stop, restart, and delete stopped or failed sessions.
- Stores app config, projects, and session records as local JSON files.

## Requirements

- Node.js 20+
- npm
- PM2 for the installed service workflow
- Claude Code installed and authenticated on the same machine
- Native build tools if `node-pty` needs to compile on your platform

## Quick Start

From a published package:

```bash
npm install -g agent-remote-control
arc install
arc start
arc open
```

From this repository:

```bash
npm install
npm run build
node dist/bin/arc.js install
node dist/bin/arc.js start
node dist/bin/arc.js open
```

`install` prompts for the app password, generates the session secret, writes config under the platform config directory, and registers the Agent Remote Control daemon with PM2.

## Development

```bash
npm install
npm run dev
```

This starts two processes:

- Fastify API and WebSocket server on `http://localhost:4096`
- Vite dev server on `http://localhost:5173`

Vite proxies `/api/*` and `/ws` to Fastify, so the SPA talks to the real backend in development. The server expects a valid config; run the install flow first so `password` and `sessionSecret` exist.

Useful commands:

```bash
npm run dev:server
npm run dev:web
npm run build
npm run build:server
npm run build:web
npm test
npx tsc --noEmit
```

## CLI

```bash
arc help
arc install                                 # set up PM2 service, prompt for password, start server
arc start                                   # start via PM2
arc start --port 5050                       # update port in config.json, then start
arc start --port 5050 --host 127.0.0.1 --password mypass --log-level debug
arc stop
arc restart
arc uninstall                               # remove PM2 service (pm2 delete arc)
arc status
arc open
arc logs
arc config
arc config set <key> <value>
arc config reset
```

`arc start` accepts inline options that are **persisted to `config.json`** before the server starts. If the PM2 process is already running it is restarted to pick up the new config; otherwise it is started fresh.

| Flag | Config key | Example |
|------|-----------|---------|
| `--port <n>` | `port` | `--port 5050` |
| `--host <h>` | `host` | `--host 127.0.0.1` |
| `--password <p>` | `password` | `--password mypass` (bcrypt-hashed before save) |
| `--log-level <l>` | `logLevel` | `--log-level debug` |
| `--session-ttl <n>` | `sessionTTL` | `--session-ttl 3600` |
| `--max-sessions <n>` | `maxConcurrentSessions` | `--max-sessions 5` |
| `--keep-logs <n>` | `keepSessionLogsLines` | `--keep-logs 200` |
| `--link-timeout <n>` | `linkExtractTimeout` | `--link-timeout 60` |

Configuration values can be inspected with `arc config`. Passwords and session secrets are hidden in CLI output.

## Configuration

Agent Remote Control writes config and state files here:

| Platform | Directory |
| --- | --- |
| Linux | `~/.agent-remote-control/` |
| macOS | `~/.agent-remote-control/` |
| Windows | `%APPDATA%\arc\` |

Default config shape:

```jsonc
{
  "port": 4096,
  "host": "0.0.0.0",
  "password": "",
  "sessionSecret": "",
  "sessionTTL": 86400,
  "linkExtractTimeout": 30,
  "maxConcurrentSessions": 10,
  "keepSessionLogsLines": 500,
  "agents": {},
  "globalEnv": {},
  "logLevel": "info"
}
```

`host=0.0.0.0` makes the app reachable from the network, so Agent Remote Control refuses to start without a password. The password is stored as a bcrypt hash, never plaintext.

## Security Model

Agent Remote Control is designed for one trusted developer using one app-level password.

- All API routes require the `rb_session` cookie except `POST /api/auth/login` and `GET /healthz`.
- All mutating requests require an `X-CSRF-Token` header that matches the CSRF cookie.
- WebSocket connections are authenticated during the HTTP upgrade.
- Project paths are validated server-side as existing absolute directories.
- Agent commands come from the built-in catalog or config, never from raw browser launch payloads.
- Agent Remote Control only terminates PTY processes it spawned and tracks.

When bound to `0.0.0.0`, the CLI prints a network-exposure warning and the web UI keeps a persistent warning visible.

## Persistence

Agent Remote Control stores local JSON state:

```text
~/.agent-remote-control/
├── config.json
├── projects.json
└── sessions.json
```

On Unix-like systems the directory is mode `0700` and files are mode `0600`. Writes are atomic: data is written to a temporary file and renamed into place.

Session logs are in-memory only. They are bounded by `keepSessionLogsLines`, streamed over WebSocket, and not persisted to `sessions.json`.

## Testing

```bash
npm test
npm test -- tests/core/auth.test.ts
npm test -- tests/sessions/link-extractor.test.ts
npx vitest run tests/e2e/full-flow.test.ts
```

The E2E test boots a real Fastify server, opens a real WebSocket, and launches a fake Claude-like agent through `node-pty`. Test setup redirects `$HOME` into a temporary sandbox so tests do not touch your real `~/.agent-remote-control` directory.

## Project Structure

```text
bin/arc.ts          CLI entrypoint
src/cli/                     commander-based CLI commands
src/server/                  Fastify API, auth, persistence, sessions, WebSocket
src/server/sessions/         agent catalog, link extraction, PTY session manager
src/web/                     React/Vite SPA
tests/                       unit, route, session, and E2E tests
docs/REQUIMENT.md            functional and non-functional requirements
docs/DESIGN.md               frontend design reference
CONTEXT.md                   verified Agent Remote Control domain facts
```

## Contributor Notes

- Phase 1 means Claude Code only. Keep other providers disabled unless the requirements change.
- Use `node-pty` for agent processes. Do not replace it with `child_process.spawn`.
- Keep the Claude link pattern aligned with `CONTEXT.md`.
- Do not persist session logs.
- Do not expose `password` or `sessionSecret` through `GET /api/config`.
- Follow the hard rules in `AGENTS.md` and `docs/REQUIMENT.md` before changing session, auth, config, or process-management logic.
