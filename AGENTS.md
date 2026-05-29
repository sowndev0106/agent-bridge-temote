# AGENTS.md

This file provides guidance to coding agents (Claude Code, Codex, Cursor, Gemini, etc.) when working in this repository.

## Scope

`agent-bridge-temote` (RemoteBridge) is a Node.js CLI app installed globally via `npm install -g remotebridge`. It lets a developer launch and manage local AI coding agents (Claude Code, Gemini CLI, OpenCode, Codex) from a browser UI. For each agent session the app spawns the agent process, captures the remote URL it prints to stdout, and surfaces it in the web interface.

The repo is currently in the spec-and-plan stage — no source code yet. Implementation begins after the plan is written from the docs.

## Phase Priority

**Phase 1 = Claude Code only.** Do not implement Gemini, OpenCode, Codex, or
any other provider until Phase 1 is fully working and tested. Stubs for other
providers are allowed (visible-and-disabled in UI) but must contain no real
logic. See `docs/REQUIMENT.md` §Delivery Phases for the full boundary.

## Authoritative Documents

Source of truth, in priority order. When documents conflict, the higher entry wins:

| Document | Purpose | When to read |
|---|---|---|
| [docs/REQUIMENT.md](docs/REQUIMENT.md) | All functional and non-functional requirements, CLI surface, API routes, config reference | Before any task |
| [docs/DESIGN.md](docs/DESIGN.md) | Frontend component tree, page layouts, state management, ASCII mockups | Before any UI task |
| [docs/superpowers/specs/2026-05-29-remotebridge-design.md](docs/superpowers/specs/2026-05-29-remotebridge-design.md) | Architecture decision summary and key constraints | When making architectural choices |

The filename `docs/REQUIMENT.md` matches this project's convention — do not rename it.

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
2. Confirm any dependencies from prior tasks are complete.

### Step 2 — Write an implementation plan

Invoke **`superpowers:writing-plans`**. Save the plan to
`docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`.

The plan must:
- Reference the requirement section it satisfies.
- Decompose into ≤ 1-hour units.
- Identify the test that proves each unit done.

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

## Hard Rules — never violate

These invariants are derived directly from [docs/REQUIMENT.md](docs/REQUIMENT.md).

| # | Rule | Source | Why |
|---|---|---|---|
| H1 | If the configured port is busy, **fail with a clear error message**. Never kill or signal the holding process. | NFR1 | Could destroy running user work. |
| H2 | When `host=0.0.0.0`, **refuse to start** unless `password` is set. Print a setup guide. | NFR3 | App is publicly reachable; no password means open access. |
| H3 | Print a **red warning banner** in the CLI on start whenever `host=0.0.0.0`. Show a **persistent warning banner** in the web UI. | NFR3 | User must always know when the app is network-exposed. |
| H4 | Store password as a **bcrypt hash** — never plaintext. | NFR3 | — |
| H5 | All API routes and WebSocket connections require a valid **session cookie**. Only `POST /api/auth/login` and `GET /healthz` are public. | NFR3 | No unauthenticated access to projects, sessions, config, or logs. |
| H6 | All mutating requests (POST / PUT / DELETE) require a **CSRF token** in `X-CSRF-Token`. | NFR3 | Prevents cross-site request forgery against the local server. |
| H7 | `GET /api/config` **never returns** `password` or `sessionSecret`. | NFR3 | Secrets must not leak to the frontend. |
| H8 | Agent `command` is sourced **only** from the built-in agent catalog or `config.json` — never from the raw client request payload. | FR3, NFR3 | Prevents arbitrary command injection from the browser. |
| H9 | Project `path` is **validated server-side** as an existing absolute directory before saving or using as `cwd`. | FR1, FR3, NFR3 | Prevents spawning agents in invalid or unintended directories. |
| H10 | App may only **SIGTERM** agent processes it spawned (tracked by PID in sessions.json). Never signal unrelated OS processes. | FR5 | Could kill unrelated user work. |
| H11 | `~/.remotebridge/` directory: mode **`0700`**. All files inside: mode **`0600`**. Written atomically. | NFR3 | Protects config, secrets, and session data from other OS users. |
| H12 | Login endpoint is **rate-limited**: max 10 attempts / minute per IP. | NFR3 | Prevents brute-force against the app password. |
| H13 | RemoteBridge **never stores or extracts** credentials or auth tokens belonging to AI services (Anthropic, Google, OpenAI, etc.). The user manages their own AI service auth. | Design decision | Scope boundary — RemoteBridge is a launcher, not an auth proxy. |
| H14 | `linkPattern` regex match runs against **each stdout line individually**. Never execute or eval agent output. | FR4 | Agent output is untrusted; only extract a URL string from it. |

---

## Project Structure (planned)

```
agent-bridge-temote/
├── bin/
│   └── remotebridge              # thin CLI entry point
├── src/
│   ├── cli/                      # subcommands: help, install, start, stop, restart, status, open, logs, config
│   ├── server/
│   │   ├── core/                 # config, auth, session-cookie, csrf, persistence, logger
│   │   ├── http/                 # Fastify routes by domain (auth, projects, agents, sessions, config)
│   │   ├── ws/                   # WebSocket server + event broadcast
│   │   ├── sessions/             # session state machine + process spawner + stdout listener
│   │   └── agents/               # built-in agent catalog + link pattern registry
│   └── web/                      # React 18 + Vite SPA
│       ├── pages/                # LoginPage, Dashboard, SettingsPage
│       ├── components/           # SessionCard, ProjectCard, modals, drawers
│       ├── stores/               # Zustand slices (sessions, projects, ui, config)
│       └── lib/                  # api client, ws hook
├── docs/
│   ├── REQUIMENT.md
│   ├── DESIGN.md
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── AGENTS.md
└── package.json
```

---

## Key Conventions

**Config defaults:** Every config key must have a default in `src/server/core/config.ts`. A user running `remotebridge start` with zero config must get a working server.

**Error messages:** Validation errors and config errors must include the failing key name, the expected type/format, and the string `"Run 'remotebridge help' for usage."` — no dead-end error messages.

**Session state:** Session state transitions follow the state machine in `docs/REQUIMENT.md`. Do not add intermediate states without updating the spec.

**WebSocket events:** Only two event types exist: `session.updated` and `session.log`. Do not add new event types without updating both `docs/REQUIMENT.md` and the frontend WS hook.

**Agent catalog:** The built-in agent list is the single source of truth for agent IDs. UI dropdowns, API responses, and config validation all reference the same catalog object — never hardcode agent names outside it.

**Passwords:** Never log, print, or include the raw password in any error message, stack trace, or API response. Log only `"[password set]"` or `"[password missing]"`.
