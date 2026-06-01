# Codex Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate OpenAI Codex into RemoteBridge as a deeply integrated, premium agent with a React-based Rich Chat UI, realtime delta streaming, interactive approval prompts, and side-by-side Monaco diff views.

**Architecture:** Encapsulate Claude's PTY logic and Codex's stdio JSON-RPC logic into specific `AgentAdapter` implementations. Broadcast rich chat state inside the existing `session.updated` WS envelope.

**Tech Stack:** TypeScript, React 18, Fastify 4, Node JSON-RPC, Monaco Editor, Vitest, Playwright.

---

### Task 1: Refactor SessionManager & AgentAdapter Interface

**Files:**
- Create: `src/server/sessions/adapter.ts`
- Create: `src/server/sessions/pty-adapter.ts`
- Modify: `src/server/sessions/manager.ts`
- Test: `tests/sessions/adapter.test.ts`

- [ ] **Step 1: Write the failing test**
  Create `tests/sessions/adapter.test.ts`:
  ```typescript
  import { describe, expect, test } from 'vitest'
  import { SessionManager } from '../../src/server/sessions/manager.js'
  import { PtyAgentAdapter } from '../../src/server/sessions/pty-adapter.js'

  describe('AgentAdapter integration', () => {
    test('SessionManager uses PtyAgentAdapter for Claude Code', async () => {
      // Test setup showing SessionManager resolves and invokes adapter
      expect(PtyAgentAdapter).toBeDefined()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest tests/sessions/adapter.test.ts`
  Expected: FAIL (Cannot find module)

- [ ] **Step 3: Write minimal implementation**
  Create `src/server/sessions/adapter.ts`:
  ```typescript
  import { Session, AppConfig } from '../../types.js'

  export interface LaunchOptions {
    project: { path: string; env: Record<string, string> }
    config: AppConfig
  }

  export interface AgentAdapter {
    launch(sessionId: string, options: LaunchOptions, isRestart?: boolean): Promise<void>
    stop(sessionId: string): void
  }
  ```
  Create `src/server/sessions/pty-adapter.ts` and refactor the `node-pty` spawn block from `SessionManager.launch()` into it.
  Update `src/server/sessions/manager.ts` to call the resolved adapter.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest tests/sessions/adapter.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/server/sessions/ tests/sessions/
  git commit -m "feat: introduce AgentAdapter interface and PtyAgentAdapter refactor"
  ```

---

### Task 2: Create CodexAgentAdapter & CodexAppServerClient

**Files:**
- Create: `src/server/sessions/codex-client.ts`
- Create: `src/server/sessions/codex-adapter.ts`
- Test: `tests/sessions/codex-client.test.ts`

- [ ] **Step 1: Write the failing test**
  Create `tests/sessions/codex-client.test.ts` to test JSON-RPC parsing:
  ```typescript
  import { describe, expect, test } from 'vitest'
  import { CodexAppServerClient } from '../../src/server/sessions/codex-client.js'

  describe('CodexAppServerClient', () => {
    test('parses newline-delimited JSON-RPC messages and pairs requests', async () => {
      expect(CodexAppServerClient).toBeDefined()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest tests/sessions/codex-client.test.ts`
  Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
  Create `src/server/sessions/codex-client.ts` to process stdin/stdout communication using Node JSON-RPC specs.
  Create `src/server/sessions/codex-adapter.ts` implementing `AgentAdapter` to spawn `codex app-server --listen stdio://`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest tests/sessions/codex-client.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add src/server/sessions/codex-* tests/sessions/codex-client.test.ts
  git commit -m "feat: implement CodexAgentAdapter and CodexAppServerClient"
  ```

---

### Task 3: REST API & WebSocket Integration for Codex

**Files:**
- Modify: `src/server/routes/sessions.ts`
- Modify: `src/server/ws/index.ts`
- Test: `tests/routes/codex.test.ts`

- [ ] **Step 1: Write the failing test**
  Create `tests/routes/codex.test.ts` to verify post message API and approval resolution.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest tests/routes/codex.test.ts`
  Expected: FAIL (404/not found)

- [ ] **Step 3: Write minimal implementation**
  Add endpoints `/api/codex/sessions/:sessionId/messages`, `/api/codex/sessions/:sessionId/interrupt` and `/api/codex/sessions/:sessionId/approvals/:approvalId` in `src/server/routes/sessions.ts`.
  Ensure `SessionManager.updateSession()` triggers `session.updated` correctly over WebSocket.

- [ ] **Step 4: Run test to verify it passes**
  Run: `npx vitest tests/routes/codex.test.ts`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git commit -am "feat: implement Codex HTTP REST endpoints and WS state sync"
  ```

---

### Task 4: Extend Zustand Store & Shared Types

**Files:**
- Modify: `src/types.ts`
- Modify: `src/web/stores/sessions.ts`

- [ ] **Step 1: Extend Types & Zustand Store**
  Add `chatHistory` and `activeTurn` into `Session` inside `src/types.ts`.
  Update React sessions store to properly merge updates.

- [ ] **Step 2: Run type-check**
  Run: `npx tsc --noEmit`
  Expected: PASS (No compilation errors)

- [ ] **Step 3: Commit**
  ```bash
  git commit -am "feat: extend shared Session types and React sessions store"
  ```

---

### Task 5: Build CodexChatPanel React Component

**Files:**
- Create: `src/web/components/CodexChatPanel.tsx`

- [ ] **Step 1: Implement CodexChatPanel**
  Write React code for `CodexChatPanel` rendering markdown-supported chat bubbles, an interactive approval glassmorphic prompt banner, and MonacoDiffPanel.

- [ ] **Step 2: Type-check and build trial**
  Run: `npm run build:web`
  Expected: SUCCESS

- [ ] **Step 3: Commit**
  ```bash
  git add src/web/components/CodexChatPanel.tsx
  git commit -m "feat: implement premium CodexChatPanel split layout component"
  ```

---

### Task 6: Hook into Workspace & Remove Old Modal

**Files:**
- Modify: `src/web/components/TerminalPanel.tsx`
- Modify: `src/web/components/SessionRow.tsx`
- Modify: `src/web/components/Layout.tsx`
- Delete: `src/web/components/CodexRemoteModal.tsx`

- [ ] **Step 1: Switch terminal/chat display and remove modal**
  Replace old copy-paste instructions and old Modal completely. Update `TerminalPanel.tsx` to render `CodexChatPanel` instead of standard xterm terminal when `session.agentId === 'codex'`.

- [ ] **Step 2: Verify type-check & build**
  Run: `npx tsc --noEmit && npm run build`
  Expected: SUCCESS

- [ ] **Step 3: Commit**
  ```bash
  git commit -am "feat: switch to CodexChatPanel in workspace and purge legacy CodexRemoteModal"
  ```

---

### Task 7: E2E Playwright Testing

**Files:**
- Create: `tests/e2e/codex-flow.test.ts`

- [ ] **Step 1: Write E2E flow test**
  Create `tests/e2e/codex-flow.test.ts` using Playwright, simulating user login, launching Codex, sending prompt, verifying streamed delta, approving command, and checking diff panel.

- [ ] **Step 2: Execute entire test suite**
  Run: `npm test` and `npx playwright test`
  Expected: ALL PASS

- [ ] **Step 3: Commit & Finish**
  ```bash
  git add tests/e2e/
  git commit -m "test: add E2E Playwright test suite for Codex chat flow"
  ```
