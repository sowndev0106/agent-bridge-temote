# Codex Remote Web UI Solution

Date: 2026-06-01

Status: design note only. This is not part of RemoteBridge Phase 1. RemoteBridge Phase 1 remains Claude Code only. Codex work belongs in Phase 2 or a separate experimental branch.

## Goal

Build a phone-friendly web chat UI that controls Codex through a local backend. The web UI should support realtime responses, approvals, interrupt, resume, and session continuity without scraping the terminal TUI.

The source of truth is a Codex app-server thread, not a terminal window.

```text
RemoteBridge sessionId -> Codex threadId
```

This means the web UI syncs 1:1 with the Codex thread/session managed by `codex app-server`. It does not mirror an independent terminal window running `codex`.

## Recommended Architecture

```text
Phone/browser UI
  -> RemoteBridge HTTP API + WebSocket/SSE
  -> CodexAdapter
  -> CodexAppServerClient
  -> codex app-server --listen stdio://
  -> Codex thread
```

Use `codex app-server` as the Codex integration layer. Prefer `stdio` transport for production because it avoids opening a local port. Loopback WebSocket is acceptable for local debugging, but should not be exposed directly to the browser or internet.

Primary references:

- https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- https://openai.com/index/unlocking-the-codex-harness/

## Non-Goals

- Do not scrape or parse the Codex terminal TUI as the main integration.
- Do not expose `codex app-server` directly to phone/browser clients.
- Do not promise live bidirectional sync with a separate terminal TUI process.
- Do not implement Gemini/OpenCode/Codex production providers during RemoteBridge Phase 1.

If true terminal mirroring is required, that is a different feature:

```text
browser xterm.js -> backend -> node-pty -> codex CLI TUI
```

That gives terminal sync, but not a stable semantic chat/diff/approval UI.

## Core Flow

### 1. Start Codex App Server

The backend owns the app-server process:

```bash
codex app-server --listen stdio://
```

For debugging only:

```bash
RUST_LOG=debug LOG_FORMAT=json codex app-server --listen ws://127.0.0.1:4222 2> codex-debug.jsonl
```

Debug logs are observability only. They must not be the product API.

### 2. Initialize Protocol

Backend sends an app-server initialize request, then stores the negotiated protocol/version metadata.

### 3. Create A Web Session

Browser calls RemoteBridge:

```text
POST /api/codex/sessions
```

Backend validates the project path, calls Codex:

```text
thread/start { cwd }
```

Backend stores:

```text
rb_session_123 -> codex_thread_abc
```

### 4. Send A Chat Message

Browser calls:

```text
POST /api/codex/sessions/rb_session_123/messages
```

Backend calls:

```text
turn/start { threadId: "codex_thread_abc", input: "Fix login bug" }
```

### 5. Stream Realtime Events

Codex emits notifications such as:

```text
turn/started
item/*
turn/completed
```

Backend maps them to browser events:

```text
message.delta
approval.requested
approval.resolved
turn.completed
session.updated
```

The browser receives these over WebSocket or SSE and renders chat, status, approvals, logs, and diffs.

### 6. Resume Existing Session

When the browser reconnects or the backend restarts, RemoteBridge uses its persisted mapping:

```text
RemoteBridge sessionId -> Codex threadId
```

Then calls:

```text
thread/resume { threadId }
```

New user messages continue in the same Codex thread.

## Backend Components

### CodexAppServerProcess

Responsibilities:

- spawn `codex app-server --listen stdio://`;
- keep stdin/stdout JSON-RPC pipes open;
- capture stderr debug logs separately;
- restart only when safe;
- never expose the app-server process directly to the network.

### CodexAppServerClient

Responsibilities:

- send JSON-RPC requests with unique ids;
- correlate responses to pending requests;
- parse notifications;
- surface protocol errors with typed app errors;
- support request timeouts;
- load generated protocol types from `codex app-server generate-ts`.

### CodexAdapter

Responsibilities:

- implement RemoteBridge's provider/session interface;
- map `sessionId` to `threadId`;
- call `thread/start`, `thread/resume`, `turn/start`, `turn/interrupt`, and `thread/compact/start`;
- translate Codex notifications into RemoteBridge web events;
- manage approval requests and decisions;
- declare provider capabilities.

### Session Store

Codex session metadata should be persisted by RemoteBridge:

```ts
type CodexSessionMetadata = {
  sessionId: string
  provider: 'codex'
  projectId: string
  cwd: string
  threadId: string
  activeTurnId?: string
  state: 'launching' | 'running' | 'stopped' | 'failed'
  createdAt: string
  updatedAt: string
}
```

Codex thread content/history remains owned by Codex. RemoteBridge stores only the mapping and UI metadata required to reconnect.

## Suggested HTTP API

These are RemoteBridge APIs, not native Codex APIs.

```text
POST   /api/codex/sessions
GET    /api/codex/sessions
GET    /api/codex/sessions/:sessionId
POST   /api/codex/sessions/:sessionId/messages
POST   /api/codex/sessions/:sessionId/interrupt
POST   /api/codex/sessions/:sessionId/compact
POST   /api/codex/sessions/:sessionId/approvals/:approvalId
DELETE /api/codex/sessions/:sessionId
WS     /ws
```

All routes except login/health must use RemoteBridge session auth. Mutating routes must use CSRF protection.

## Browser Events

The browser should receive provider-normalized events:

```ts
type CodexUiEvent =
  | { type: 'session.started'; sessionId: string; threadId: string }
  | { type: 'turn.started'; sessionId: string; threadId: string; turnId: string }
  | { type: 'message.delta'; sessionId: string; threadId: string; turnId: string; delta: string }
  | { type: 'approval.requested'; sessionId: string; threadId: string; approvalId: string; command: string }
  | { type: 'approval.resolved'; sessionId: string; threadId: string; approvalId: string; decision: 'approved' | 'rejected' }
  | { type: 'turn.completed'; sessionId: string; threadId: string; turnId: string; status: 'completed' | 'interrupted' }
```

Exact production event names should be reconciled with RemoteBridge's existing WebSocket contract before implementation.

## Capabilities Model

Do not assume every provider supports the same features. Codex should declare capabilities explicitly:

```ts
const codexCapabilities = {
  structuredEvents: true,
  streaming: true,
  approvals: true,
  diffView: true,
  resume: true,
  compact: true,
  interrupt: true,
  shellCommand: true,
  terminalMirror: false
}
```

The UI should render only controls supported by the active provider.

## Slash Commands

Slash commands are client UX. Do not blindly forward unknown slash commands to Codex.

Map commands into explicit UI actions:

| CLI-style command | Web UI treatment |
|---|---|
| `/help` | help drawer or command palette |
| `/status` | status panel backed by session/app-server state |
| `/model` | model selector if supported by generated protocol |
| `/approvals` | approval policy control if supported |
| `/init` | "Initialize project" workflow or prompt template |
| `/compact` | `thread/compact/start` when supported |

Unknown commands should return a clear unsupported-command error.

## Testing Strategy

The implementation should be gated in layers.

### Layer 1: Mock Contract Tests

Already started in:

```text
tests/codex/codex-remote-ui.mock.test.ts
```

This validates:

- `RemoteBridge sessionId -> Codex threadId` mapping;
- realtime turn event mapping;
- resume on the same thread;
- approval roundtrip;
- interrupt;
- concurrent sessions without cross-talk.

### Layer 2: Fake App-Server Fixture

Build a fixture process that speaks newline-delimited JSON-RPC over stdio. Use it to test the real `CodexAppServerClient` without requiring Codex.

Required cases:

- request/response correlation;
- notification parsing;
- malformed JSON;
- app-server error response;
- pending request timeout;
- app-server process exit;
- reconnect/restart behavior.

### Layer 3: Real Codex Smoke Tests

Run only when Codex CLI is installed and explicitly enabled with an env var, for example:

```bash
RUN_CODEX_SMOKE=1 npm test -- tests/codex/codex-app-server.smoke.test.ts
```

Required cases:

- spawn `codex app-server --listen stdio://`;
- initialize;
- generate or load protocol version info;
- `thread/start` in a temp project;
- `turn/start` with a harmless prompt;
- receive stream notifications until completion;
- `thread/resume` same thread.

### Layer 4: Route + WebSocket Integration

Use Fastify inject and WebSocket tests:

- login;
- create Codex session;
- send message;
- receive realtime event;
- approval request/resolve;
- interrupt;
- browser reconnect resumes the same session.

### Layer 5: UI E2E

Use Playwright:

- create session from project;
- send prompt;
- see streaming transcript;
- approve command;
- inspect diff/status;
- refresh page and verify same session remains attached.

## Implementation Order

1. Keep Codex disabled in the agent catalog while Phase 1 is active.
2. Generate and pin app-server protocol types for a specific Codex CLI version.
3. Implement `CodexAppServerClient` against the fake app-server fixture.
4. Implement `CodexAdapter` with mock/fake tests.
5. Add route handlers behind a disabled/experimental feature flag.
6. Add WebSocket/SSE event bridge.
7. Add real Codex smoke tests gated by env var.
8. Add UI controls for chat, status, interrupt, resume, approval, and compact.
9. Enable Codex provider only after Phase 1 Claude Code requirements are complete.

## Security Rules

- Keep app-server local and private.
- Expose only RemoteBridge's authenticated API.
- Validate project paths server-side before passing `cwd`.
- Never accept a raw command from the browser for process spawning.
- Require CSRF for mutating HTTP routes.
- Treat all app-server messages as untrusted input at the RemoteBridge boundary.
- Do not log raw secrets, tokens, or AI service credentials.
- Keep password/session secret exclusion behavior for config responses.

## Feasibility Summary

This approach is feasible for Codex because the app-server protocol provides the right abstraction: threads, turns, realtime notifications, approvals, resume, and interrupt. It is more stable than terminal scraping and more suitable for a phone web UI.

The main risk is protocol drift. Mitigate it by pinning the Codex CLI/app-server version, committing generated protocol types, and running mock, fake-server, and real smoke tests before enabling the provider.

## Open Questions

- Which Codex CLI/app-server version should Phase 2 pin?
- Should production use stdio only, or allow loopback WebSocket for debugging?
- How should Codex UI events fit RemoteBridge's existing two-event WebSocket contract?
- Which slash commands are required for the first Codex release?
- Should RemoteBridge cache transcript snippets, or rely entirely on Codex thread history?
