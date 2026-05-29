# RemoteBridge

RemoteBridge is a local Node.js app that launches AI coding agents from a browser UI and surfaces the remote-control URL each agent prints to its terminal output.

Phase 1 is Claude Code only: RemoteBridge launches `claude --remote-control`, captures the `https://claude.ai/code/session_...` link from the PTY stream, and shows it in the web app. Gemini CLI, OpenCode, and Codex are present only as disabled catalog stubs until Phase 1 is fully working.

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
npm install -g remotebridge
remotebridge install
remotebridge start
remotebridge open
```

From this repository:

```bash
npm install
npm run build
node dist/bin/remotebridge.js install
node dist/bin/remotebridge.js start
node dist/bin/remotebridge.js open
```

`install` prompts for the app password, generates the session secret, writes config under the platform config directory, and registers the RemoteBridge daemon with PM2.

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
remotebridge help
remotebridge install
remotebridge start
remotebridge stop
remotebridge restart
remotebridge status
remotebridge open
remotebridge logs
remotebridge config
remotebridge config set <key> <value>
remotebridge config reset
```

Configuration values can be inspected with `remotebridge config`. Passwords and session secrets are hidden in CLI output.

## Configuration

RemoteBridge writes config and state files here:

| Platform | Directory |
| --- | --- |
| Linux | `~/.remotebridge/` |
| macOS | `~/.remotebridge/` |
| Windows | `%APPDATA%\remotebridge\` |

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

`host=0.0.0.0` makes the app reachable from the network, so RemoteBridge refuses to start without a password. The password is stored as a bcrypt hash, never plaintext.

## Security Model

RemoteBridge is designed for one trusted developer using one app-level password.

- All API routes require the `rb_session` cookie except `POST /api/auth/login` and `GET /healthz`.
- All mutating requests require an `X-CSRF-Token` header that matches the CSRF cookie.
- WebSocket connections are authenticated during the HTTP upgrade.
- Project paths are validated server-side as existing absolute directories.
- Agent commands come from the built-in catalog or config, never from raw browser launch payloads.
- RemoteBridge only terminates PTY processes it spawned and tracks.

When bound to `0.0.0.0`, the CLI prints a network-exposure warning and the web UI keeps a persistent warning visible.

## Persistence

RemoteBridge stores local JSON state:

```text
~/.remotebridge/
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

The E2E test boots a real Fastify server, opens a real WebSocket, and launches a fake Claude-like agent through `node-pty`. Test setup redirects `$HOME` into a temporary sandbox so tests do not touch your real `~/.remotebridge` directory.

## Project Structure

```text
bin/remotebridge.ts          CLI entrypoint
src/cli/                     commander-based CLI commands
src/server/                  Fastify API, auth, persistence, sessions, WebSocket
src/server/sessions/         agent catalog, link extraction, PTY session manager
src/web/                     React/Vite SPA
tests/                       unit, route, session, and E2E tests
docs/REQUIMENT.md            functional and non-functional requirements
docs/DESIGN.md               frontend design reference
CONTEXT.md                   verified RemoteBridge domain facts
```

## Contributor Notes

- Phase 1 means Claude Code only. Keep other providers disabled unless the requirements change.
- Use `node-pty` for agent processes. Do not replace it with `child_process.spawn`.
- Keep the Claude link pattern aligned with `CONTEXT.md`.
- Do not persist session logs.
- Do not expose `password` or `sessionSecret` through `GET /api/config`.
- Follow the hard rules in `AGENTS.md` and `docs/REQUIMENT.md` before changing session, auth, config, or process-management logic.
