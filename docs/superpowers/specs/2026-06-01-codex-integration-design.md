# Spec: Codex App-Server Rich Integration Design

- **Date:** 2026-06-01
- **Status:** Approved Spec. Ready for implementation planning.

---

## 1. Goal

Integrate OpenAI Codex into RemoteBridge as a deeply integrated, premium agent with a React-based Rich Chat UI, realtime delta streaming, interactive approval prompts, and side-by-side Monaco diff views.

### Non-Goals
- We do NOT expose `codex app-server`'s local ports or processes to the external network.
- We do NOT scrape the terminal PTY or TUI for Codex.
- We do NOT introduce new WebSocket event types to keep protocol simplicity.

---

## 2. Architecture & Data Flow

We leverage `codex app-server --listen stdio://` to communicate via standard JSON-RPC over stdin/stdout pipes. This eliminates TTY/PTY scraping completely.

```text
+---------------------+              (WebSocket)              +----------------------+
|                     | <-----------------------------------> |                      |
|  React Web App      |                                       |  RemoteBridge        |
|  (CodexChatPanel)   | <===================================> |  Fastify Backend     |
|                     |           (REST HTTP APIs)            |                      |
+---------------------+                                       +----------------------+
                                                                         ^
                                                                         | (stdio JSON-RPC)
                                                                         v
                                                              +----------------------+
                                                              |  codex app-server    |
                                                              +----------------------+
```

---

## 3. Backend Implementation Details

### 3.1. General `AgentAdapter` Interface
To isolate PTY-based agents (Claude Code) from JSON-RPC stdio-based agents (Codex), we introduce the **Adapter Pattern** into `SessionManager`:

```typescript
export interface LaunchOptions {
  project: { path: string; env: Record<string, string> }
  config: AppConfig
}

export interface AgentAdapter {
  launch(sessionId: string, options: LaunchOptions, isRestart?: boolean): Promise<void>
  stop(sessionId: string): void
  write?(sessionId: string, data: string): boolean
  resize?(sessionId: string, cols: number, rows: number): boolean
  onRawData?(sessionId: string, listener: (data: string) => void): () => void
}
```

- **`PtyAgentAdapter`**: Encapsulates the existing `node-pty` launch logic for Claude Code.
- **`CodexAgentAdapter`**: Encapsulates the stdio spawn logic, the `CodexAppServerClient` connection, and thread state transitions.

### 3.2. Spawning `codex app-server`
When launching a Codex session, `CodexAgentAdapter`:
1. Spawns `codex app-server --listen stdio://` via Node's `child_process.spawn()`.
2. Automatically sends the `initialize` JSON-RPC handshake request and stores negotiated protocol capabilities.
3. Maps the RemoteBridge `sessionId` to a new Codex thread by sending a `thread/start { cwd }` request.
4. Stores the persistent `threadId` mapping in `Session.providerSessionId` so that resumes can reference the same thread via `thread/resume { threadId }`.

### 3.3. `CodexAppServerClient`
A helper client that parses newline-delimited JSON-RPC over standard pipes:
- Correctly pairs JSON-RPC `id` requests with their responses.
- Handles asynchronous Codex notifications (e.g. `turn/started`, `item/agentMessage/delta`, `turn/completed`).
- Leverages timeouts for hanging requests.

---

## 4. Frontend & API Integration

### 4.1. Shared Types (`src/types.ts`)
We extend `Session` to include Codex-specific state cleanly:

```typescript
export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

export interface CodexActiveTurn {
  id: string
  status: 'running' | 'completed' | 'interrupted'
  delta?: string
  approval?: {
    id: string
    command: string
    status: 'pending' | 'approved' | 'rejected'
  }
}

// Extended fields in Session
export interface Session {
  // Existing fields...
  id: string
  projectId: string
  agentId: string
  state: SessionState
  pid: number | null
  remoteLink: string | null
  
  // Codex rich state
  chatHistory?: ChatMessage[]
  activeTurn?: CodexActiveTurn | null
}
```

### 4.2. WebSocket Integration
No new WebSocket event types are added. Instead:
- Every time a chat response streams from Codex, or an approval request is triggered, the backend updates the Session model in-memory and calls `SessionManager.updateSession()`.
- This automatically broadcasts `{ type: 'session.updated', payload: Omit<Session, 'logs'> }`.
- The frontend Zustand store updates, and the React UI seamlessly renders the new text or the approval banner!

### 4.3. REST APIs
We register specific sub-routes for custom Codex actions (secured by session authentication and CSRF headers):
- `POST /api/codex/sessions/:sessionId/messages`: Triggers `turn/start { threadId, input }`.
- `POST /api/codex/sessions/:sessionId/interrupt`: Triggers `turn/interrupt`.
- `POST /api/codex/sessions/:sessionId/approvals/:approvalId`: Sends approval decision (`approved` | `rejected`) back to the active turn promise.

### 4.4. React `CodexChatPanel` Layout
Replaces the standard xterm.js tab when `agentId === 'codex'`:
- **Chat Feed**: Beautiful, responsive layout showing user and agent messages with Markdown support.
- **Glassmorphic Approval Prompt**: A highly premium visual banner showing the exact command Codex wants to run. Renders two clear actions: `Approve` and `Reject`.
- **Side-by-Side Diff Panel**: Integrated right next to the chat, rendering file differences via the existing `MonacoDiffPanel`.

---

## 5. Security & Isolation

- **Server-Side Validation**: All path parameters and command executions are strictly checked. No raw shell executions are accepted directly from the client.
- **CSRF & Cookie Protection**: Every mutating HTTP endpoint requires a valid `X-CSRF-Token` header.
- **Private app-server**: The `codex app-server` runs privately on the host machine using standard pipes and is never exposed directly via TCP/WebSocket to the internet.

---

## 6. Testing Strategy

1. **Mock Contract Tests**: Verify `sessionId -> threadId` state mapping and turn streaming using mock files.
2. **Fake App-Server Fixture**: Test `CodexAppServerClient` using a mock JSON-RPC stdio mock executable.
3. **Integration & Route Tests**: Check all `/api/codex/*` REST routes and state updates via Fastify inject.
4. **E2E Playwright Tests**: Automate UI interactions (sending chat prompt, verifying streaming delta, approving a command, checking diff side panel).
