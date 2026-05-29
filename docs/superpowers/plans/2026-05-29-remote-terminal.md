# Remote Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive remote terminal to RemoteBridge — both standalone shell terminals and interactive session terminals — using PTY-over-WebSocket with xterm.js.

**Architecture:** Extend the existing `/ws` WebSocket connection with multiplexed terminal messages. Server-side: a new `TerminalManager` spawns standalone bash PTYs; `SessionManager` gets `write()`/`resize()` to expose existing session PTYs for interactive use. Client-side: xterm.js renders full ANSI/TUI in a collapsible bottom panel with tabs.

**Tech Stack:** `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` (frontend), `node-pty` (already installed, backend), Zustand (state), existing WS infrastructure.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/server/terminals/manager.ts` | `TerminalManager` — spawn/kill standalone bash PTYs, track by UUID, scrollback buffer |
| `src/web/stores/terminals.ts` | Zustand store — terminal tabs, active tab, panel visibility |
| `src/web/components/TerminalPanel.tsx` | Bottom collapsible panel with tab bar + xterm.js instances |
| `src/web/components/TerminalTab.tsx` | Single xterm.js terminal instance |

### Modified Files
| File | Change |
|------|--------|
| `src/types.ts` | Add `TerminalWsEvent` types to `WsEvent` union |
| `src/server/ws/index.ts` | Handle bidirectional `terminal.*` messages, route to managers |
| `src/server/sessions/manager.ts` | Add `write()`, `resize()`, expose raw PTY data stream for interactive use |
| `src/server/index.ts` | Create `TerminalManager`, pass to WS setup, shutdown cleanup |
| `src/web/lib/ws.ts` | Handle `terminal.*` events, expose `sendWs()` for client→server messages |
| `src/web/components/Layout.tsx` | Add `TerminalPanel` below main content with drag-resize |
| `src/web/components/LogsDrawer.tsx` | Add "Open in Terminal" button that opens session in terminal panel |
| `src/web/pages/Dashboard.tsx` | Import TerminalPanel |
| `package.json` | Add xterm dependencies |

---

## Task 1: Install xterm.js dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install xterm packages**

```bash
cd /home/sown/workplace/personal/agent-bridge-temote
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
```

Expected: packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify installation**

```bash
ls node_modules/@xterm/xterm/lib
```

Expected: directory exists with JS/CSS files.

---

## Task 2: Extend shared types for terminal WebSocket events

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add terminal event types to `src/types.ts`**

Add after the existing `WsEvent` type:

```ts
// --- Terminal types (Phase 1.1) ---

/** Client → Server terminal messages */
export type TerminalClientEvent =
  | { type: 'terminal.input';  payload: { terminalId: string; data: string } }
  | { type: 'terminal.resize'; payload: { terminalId: string; cols: number; rows: number } }
  | { type: 'terminal.create'; payload: { cwd?: string } }
  | { type: 'terminal.close';  payload: { terminalId: string } }
  | { type: 'terminal.attach'; payload: { sessionId: string } }

/** Server → Client terminal messages */
export type TerminalServerEvent =
  | { type: 'terminal.data';    payload: { terminalId: string; data: string } }
  | { type: 'terminal.created'; payload: { terminalId: string; title: string; pid: number } }
  | { type: 'terminal.closed';  payload: { terminalId: string } }
  | { type: 'terminal.attached'; payload: { terminalId: string; sessionId: string } }
```

Update the `WsEvent` union to include terminal server events:

```ts
export type WsEvent =
  | { type: 'session.updated'; payload: Omit<Session, 'logs'> }
  | { type: 'session.log';     payload: { sessionId: string; line: string } }
  | TerminalServerEvent
```

- [ ] **Step 2: Verify types compile**

```bash
cd /home/sown/workplace/personal/agent-bridge-temote && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: no new errors related to types.ts

---

## Task 3: Create TerminalManager (standalone bash PTYs)

**Files:**
- Create: `src/server/terminals/manager.ts`

- [ ] **Step 1: Create the TerminalManager class**

```ts
import * as nodePty from 'node-pty'
import { randomUUID } from 'crypto'
import { resolveCommand } from '../sessions/agent-catalog.js'

type PtyProcess = ReturnType<typeof nodePty.spawn>

export interface TerminalInfo {
  id: string
  title: string
  pid: number
  cwd: string
  createdAt: string
}

type TerminalEventCallback = (event: { type: string; payload: unknown }) => void

export class TerminalManager {
  private terminals = new Map<string, { info: TerminalInfo; pty: PtyProcess }>()
  private onEvent: TerminalEventCallback

  constructor(onEvent: TerminalEventCallback) {
    this.onEvent = onEvent
  }

  create(cwd?: string): TerminalInfo {
    const id = randomUUID()
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
    const resolvedCmd = resolveCommand(shell)
    const effectiveCwd = cwd || process.env.HOME || '/'

    const pty = nodePty.spawn(resolvedCmd, [], {
      name: 'xterm-256color',
      cwd: effectiveCwd,
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
      cols: 120,
      rows: 30
    })

    const info: TerminalInfo = {
      id,
      title: `Terminal ${this.terminals.size + 1}`,
      pid: pty.pid,
      cwd: effectiveCwd,
      createdAt: new Date().toISOString()
    }

    this.terminals.set(id, { info, pty })

    pty.onData((data: string) => {
      this.onEvent({ type: 'terminal.data', payload: { terminalId: id, data } })
    })

    pty.onExit(() => {
      this.terminals.delete(id)
      this.onEvent({ type: 'terminal.closed', payload: { terminalId: id } })
    })

    return info
  }

  write(id: string, data: string): void {
    const entry = this.terminals.get(id)
    if (!entry) return
    entry.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.terminals.get(id)
    if (!entry) return
    entry.pty.resize(cols, rows)
  }

  close(id: string): void {
    const entry = this.terminals.get(id)
    if (!entry) return
    entry.pty.kill()
    this.terminals.delete(id)
  }

  list(): TerminalInfo[] {
    return Array.from(this.terminals.values()).map(e => e.info)
  }

  has(id: string): boolean {
    return this.terminals.has(id)
  }

  async killAll(): Promise<void> {
    for (const [id, entry] of this.terminals) {
      try { entry.pty.kill() } catch { /* already gone */ }
      this.terminals.delete(id)
    }
  }
}
```

---

## Task 4: Add interactive PTY access to SessionManager

**Files:**
- Modify: `src/server/sessions/manager.ts`

- [ ] **Step 1: Add `writeToSession()` and `resizeSession()` methods**

Add these methods to the `SessionManager` class, after the existing `stop()` method:

```ts
  /** Write raw input to session PTY (interactive terminal mode) */
  writeToSession(sessionId: string, data: string): boolean {
    const child = this.processes.get(sessionId)
    if (!child) return false
    child.write(data)
    return true
  }

  /** Resize session PTY (interactive terminal mode) */
  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const child = this.processes.get(sessionId)
    if (!child) return false
    child.resize(cols, rows)
    return true
  }

  /** Check if a session has an active PTY process */
  hasProcess(sessionId: string): boolean {
    return this.processes.has(sessionId)
  }
```

- [ ] **Step 2: Add raw data callback for interactive terminal mode**

The existing `onData` handler strips ANSI and sends `session.log`. For the interactive terminal, we also need raw data. Add a `rawDataListeners` map and emit raw data in `launch()`.

Add field to the class:

```ts
  private rawDataListeners = new Map<string, Set<(data: string) => void>>()
```

Add methods:

```ts
  onRawData(sessionId: string, listener: (data: string) => void): () => void {
    if (!this.rawDataListeners.has(sessionId)) {
      this.rawDataListeners.set(sessionId, new Set())
    }
    this.rawDataListeners.get(sessionId)!.add(listener)
    return () => {
      this.rawDataListeners.get(sessionId)?.delete(listener)
      if (this.rawDataListeners.get(sessionId)?.size === 0) {
        this.rawDataListeners.delete(sessionId)
      }
    }
  }
```

In the `launch()` method, inside `child.onData`, add raw data emission before the LineBuffer processing:

```ts
    child.onData((data: string) => {
      // Emit raw data for interactive terminal listeners
      const listeners = this.rawDataListeners.get(sessionId)
      if (listeners) {
        for (const fn of listeners) fn(data)
      }
      // Existing line-buffered processing for logs
      for (const line of lineBuf.push(data)) handleLine(line)
    })
```

Also clean up listeners in `child.onExit`:

```ts
    child.onExit(() => {
      // ... existing cleanup ...
      this.rawDataListeners.delete(sessionId)
    })
```

---

## Task 5: Upgrade WebSocket server for bidirectional terminal messages

**Files:**
- Modify: `src/server/ws/index.ts`

- [ ] **Step 1: Rewrite ws/index.ts to handle terminal messages**

```ts
import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage, Server } from 'http'
import { verifySession } from '../core/auth.js'
import type { WsEvent, TerminalClientEvent } from '../../types.js'
import type { SessionManager } from '../sessions/manager.js'
import type { TerminalManager } from '../terminals/manager.js'

interface WsContext {
  sessionManager: SessionManager
  terminalManager: TerminalManager
}

export function createWsServer(httpServer: Server, sessionSecret: string, ctx?: WsContext) {
  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set<WebSocket>()
  // Track which terminals each client is listening to (for targeted data routing)
  const clientTerminals = new Map<WebSocket, Set<string>>()
  // Track raw data unsubscribers for session attach
  const sessionDetachers = new Map<string, () => void>()

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
    clientTerminals.set(ws, new Set())

    ws.on('message', (raw) => {
      if (!ctx) return
      try {
        const msg = JSON.parse(raw.toString()) as TerminalClientEvent
        handleTerminalMessage(ws, msg, ctx)
      } catch { /* ignore malformed */ }
    })

    ws.on('close', () => {
      clients.delete(ws)
      clientTerminals.delete(ws)
    })
  })

  function handleTerminalMessage(ws: WebSocket, msg: TerminalClientEvent, ctx: WsContext) {
    switch (msg.type) {
      case 'terminal.create': {
        const info = ctx.terminalManager.create(msg.payload.cwd)
        const termIds = clientTerminals.get(ws)
        termIds?.add(info.id)
        const response: WsEvent = {
          type: 'terminal.created',
          payload: { terminalId: info.id, title: info.title, pid: info.pid }
        }
        ws.send(JSON.stringify(response))
        break
      }

      case 'terminal.input': {
        const { terminalId, data } = msg.payload
        // Try standalone terminal first, then session
        if (ctx.terminalManager.has(terminalId)) {
          ctx.terminalManager.write(terminalId, data)
        } else {
          ctx.sessionManager.writeToSession(terminalId, data)
        }
        break
      }

      case 'terminal.resize': {
        const { terminalId, cols, rows } = msg.payload
        if (ctx.terminalManager.has(terminalId)) {
          ctx.terminalManager.resize(terminalId, cols, rows)
        } else {
          ctx.sessionManager.resizeSession(terminalId, cols, rows)
        }
        break
      }

      case 'terminal.close': {
        const { terminalId } = msg.payload
        ctx.terminalManager.close(terminalId)
        clientTerminals.get(ws)?.delete(terminalId)
        break
      }

      case 'terminal.attach': {
        const { sessionId } = msg.payload
        // Attach to an existing session's raw PTY output
        const termIds = clientTerminals.get(ws)
        termIds?.add(sessionId)

        // Clean up previous attachment if exists
        const prevDetach = sessionDetachers.get(sessionId)
        if (prevDetach) prevDetach()

        const detach = ctx.sessionManager.onRawData(sessionId, (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'terminal.data',
              payload: { terminalId: sessionId, data }
            }))
          }
        })
        sessionDetachers.set(sessionId, detach)

        const response: WsEvent = {
          type: 'terminal.attached',
          payload: { terminalId: sessionId, sessionId }
        }
        ws.send(JSON.stringify(response))
        break
      }
    }
  }

  function broadcast(event: WsEvent) {
    const msg = JSON.stringify(event)
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg)
    }
  }

  // Send terminal data only to relevant clients
  function sendToTerminalClients(terminalId: string, event: WsEvent) {
    const msg = JSON.stringify(event)
    for (const [client, termIds] of clientTerminals) {
      if (termIds.has(terminalId) && client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    }
  }

  return { broadcast, sendToTerminalClients }
}
```

---

## Task 6: Wire TerminalManager into server bootstrap

**Files:**
- Modify: `src/server/index.ts`

- [ ] **Step 1: Import and create TerminalManager, pass to WS**

Add import:
```ts
import { TerminalManager } from './terminals/manager.js'
```

After `createWsServer` call, create terminal manager and re-wire. Replace the existing WS + SessionManager setup block:

```ts
  // WS server first so `broadcast` exists before the manager emits any event.
  // Pass managers after construction (chicken-and-egg: managers need broadcast, WS needs managers).
  let broadcastFn: (event: WsEvent) => void = () => {}
  let sendToTerminalFn: (terminalId: string, event: WsEvent) => void = () => {}

  const manager = new SessionManager({
    keepSessionLogsLines: config.keepSessionLogsLines,
    linkExtractTimeout: config.linkExtractTimeout,
    maxConcurrentSessions: config.maxConcurrentSessions,
    sessionsFile: SESSIONS_FILE,
    onEvent: (event) => broadcastFn(event as WsEvent)
  })

  const terminalManager = new TerminalManager((event) => {
    // Route terminal.data to specific clients via sendToTerminalClients
    if (event.type === 'terminal.data') {
      const payload = event.payload as { terminalId: string; data: string }
      sendToTerminalFn(payload.terminalId, event as WsEvent)
    } else {
      broadcastFn(event as WsEvent)
    }
  })

  const { broadcast, sendToTerminalClients } = createWsServer(
    fastify.server, sessionSecret,
    { sessionManager: manager, terminalManager }
  )
  broadcastFn = broadcast
  sendToTerminalFn = sendToTerminalClients

  await manager.loadAndRecover()
```

Update the shutdown handler to also kill terminal processes:

```ts
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, async () => {
      await manager.killAll()
      await terminalManager.killAll()
      await manager.flush()
      await fastify.close().catch(() => {})
      process.exit(0)
    })
  }
```

---

## Task 7: Create Zustand terminal store

**Files:**
- Create: `src/web/stores/terminals.ts`

- [ ] **Step 1: Create the terminals store**

```ts
import { create } from 'zustand'

export interface TerminalTabInfo {
  id: string              // terminalId (UUID for standalone, sessionId for attached)
  title: string
  type: 'standalone' | 'session'
  sessionId?: string      // set when type === 'session'
  pid?: number
}

interface TerminalsStore {
  tabs: TerminalTabInfo[]
  activeTabId: string | null
  panelOpen: boolean
  panelHeight: number    // percentage of viewport height

  addTab: (tab: TerminalTabInfo) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  setPanelHeight: (height: number) => void
  updateTabTitle: (id: string, title: string) => void
}

export const useTerminalsStore = create<TerminalsStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  panelOpen: false,
  panelHeight: 35,

  addTab: (tab) => set(state => ({
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
    panelOpen: true
  })),

  removeTab: (id) => set(state => {
    const tabs = state.tabs.filter(t => t.id !== id)
    const activeTabId = state.activeTabId === id
      ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null)
      : state.activeTabId
    return { tabs, activeTabId, panelOpen: tabs.length > 0 }
  }),

  setActiveTab: (id) => set({ activeTabId: id }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  togglePanel: () => set(state => ({ panelOpen: !state.panelOpen })),
  setPanelHeight: (height) => set({ panelHeight: Math.max(15, Math.min(80, height)) }),
  updateTabTitle: (id, title) => set(state => ({
    tabs: state.tabs.map(t => t.id === id ? { ...t, title } : t)
  }))
}))
```

---

## Task 8: Upgrade WebSocket client hook for bidirectional messaging

**Files:**
- Modify: `src/web/lib/ws.ts`

- [ ] **Step 1: Rewrite ws.ts to support sending messages and terminal events**

```ts
import { useEffect, useRef, useCallback } from 'react'
import { useSessionsStore } from '../stores/sessions'
import { useConfigStore } from '../stores/config'
import { useTerminalsStore } from '../stores/terminals'
import type { WsEvent, TerminalClientEvent } from '../../types'

// Singleton WebSocket reference for sending messages from anywhere
let globalWs: WebSocket | null = null

export function getWs(): WebSocket | null {
  return globalWs
}

export function sendWsMessage(msg: TerminalClientEvent): void {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify(msg))
  }
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { updateSession, appendLog } = useSessionsStore()
  const { setWsConnected } = useConfigStore()
  const { addTab, removeTab } = useTerminalsStore()

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`

    let closed = false

    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws
      globalWs = ws

      ws.onopen = () => setWsConnected(true)
      ws.onclose = () => {
        setWsConnected(false)
        globalWs = null
        if (!closed) setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsEvent
          switch (msg.type) {
            case 'session.updated':
              updateSession(msg.payload.id, msg.payload as Parameters<typeof updateSession>[1])
              break
            case 'session.log': {
              const { sessionId, line } = msg.payload
              appendLog(sessionId, line)
              break
            }
            case 'terminal.data': {
              // Handled by individual xterm instances via event listener
              const evt = new CustomEvent('terminal-data', { detail: msg.payload })
              window.dispatchEvent(evt)
              break
            }
            case 'terminal.created': {
              // Already handled at call site via sendWsMessage response
              break
            }
            case 'terminal.closed': {
              removeTab(msg.payload.terminalId)
              break
            }
            case 'terminal.attached': {
              // Already handled at call site
              break
            }
          }
        } catch { /* ignore malformed */ }
      }
    }

    connect()
    return () => { closed = true; wsRef.current?.close(); globalWs = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
```

---

## Task 9: Create TerminalTab component (xterm.js instance)

**Files:**
- Create: `src/web/components/TerminalTab.tsx`

- [ ] **Step 1: Create TerminalTab component**

```tsx
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { sendWsMessage } from '../lib/ws'

interface TerminalTabProps {
  terminalId: string
  isActive: boolean
}

export default function TerminalTab({ terminalId, isActive }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: '#0b0d12',
        foreground: '#e4e8f4',
        cursor: '#3b82f6',
        cursorAccent: '#0b0d12',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
        black: '#1e2230',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e8f4',
        brightBlack: '#4e5a72',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f8fafc'
      },
      scrollback: 2000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term
    fitAddonRef.current = fitAddon

    // Send initial size
    sendWsMessage({
      type: 'terminal.resize',
      payload: { terminalId, cols: term.cols, rows: term.rows }
    })

    // User input → server
    term.onData((data) => {
      sendWsMessage({
        type: 'terminal.input',
        payload: { terminalId, data }
      })
    })

    // Server output → terminal
    const handleData = (e: Event) => {
      const detail = (e as CustomEvent).detail as { terminalId: string; data: string }
      if (detail.terminalId === terminalId) {
        term.write(detail.data)
      }
    }
    window.addEventListener('terminal-data', handleData)

    // Resize observer
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      sendWsMessage({
        type: 'terminal.resize',
        payload: { terminalId, cols: term.cols, rows: term.rows }
      })
    })
    observer.observe(containerRef.current)

    return () => {
      window.removeEventListener('terminal-data', handleData)
      observer.disconnect()
      term.dispose()
    }
  }, [terminalId])

  // Re-fit when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 50)
    }
  }, [isActive])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  )
}
```

---

## Task 10: Create TerminalPanel component (bottom panel with tabs)

**Files:**
- Create: `src/web/components/TerminalPanel.tsx`

- [ ] **Step 1: Create TerminalPanel component**

```tsx
import { useRef, useCallback, useEffect } from 'react'
import { useTerminalsStore, type TerminalTabInfo } from '../stores/terminals'
import TerminalTab from './TerminalTab'
import { sendWsMessage } from '../lib/ws'

export default function TerminalPanel() {
  const { tabs, activeTabId, panelOpen, panelHeight, addTab, removeTab, setActiveTab, togglePanel, setPanelHeight } = useTerminalsStore()
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const createTerminal = useCallback(() => {
    // Create standalone terminal — listen for the created response
    const handleCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail
      // Handled via WS message in ws.ts
    }

    sendWsMessage({ type: 'terminal.create', payload: {} })

    // We need to listen for the response to get the terminalId
    const handler = (e: MessageEvent) => {
      // This is handled in the WS onmessage handler
    }
  }, [])

  // Listen for terminal.created events to add tabs
  useEffect(() => {
    const handleWsMessage = (e: Event) => {
      const ce = e as CustomEvent
      const msg = ce.detail
      if (msg.type === 'terminal.created') {
        addTab({
          id: msg.payload.terminalId,
          title: msg.payload.title,
          type: 'standalone',
          pid: msg.payload.pid
        })
      }
    }
    window.addEventListener('terminal-created', handleWsMessage)
    return () => window.removeEventListener('terminal-created', handleWsMessage)
  }, [addTab])

  const handleNewTerminal = () => {
    sendWsMessage({ type: 'terminal.create', payload: {} })
  }

  const handleCloseTab = (id: string, type: TerminalTabInfo['type']) => {
    if (type === 'standalone') {
      sendWsMessage({ type: 'terminal.close', payload: { terminalId: id } })
    }
    removeTab(id)
  }

  // Drag-to-resize
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: panelHeight }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      const vh = window.innerHeight
      const newHeight = dragRef.current.startHeight + (delta / vh) * 100
      setPanelHeight(newHeight)
    }

    const handleUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [panelHeight, setPanelHeight])

  if (!panelOpen || tabs.length === 0) {
    return (
      <div className="border-t border-gray-800 bg-gray-950">
        <div className="flex items-center px-3 py-1.5">
          <button
            onClick={handleNewTerminal}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            title="New Terminal"
          >
            <span className="text-base leading-none">⌘</span>
            <span>Terminal</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="border-t border-gray-700 bg-gray-950 flex flex-col"
      style={{ height: `${panelHeight}vh` }}
    >
      {/* Drag handle */}
      <div
        className="h-1 cursor-row-resize bg-gray-800 hover:bg-blue-500/50 transition-colors flex-shrink-0"
        onMouseDown={handleDragStart}
      />

      {/* Tab bar */}
      <div className="flex items-center bg-gray-900/80 border-b border-gray-800 flex-shrink-0 px-1">
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors group ${
                activeTabId === tab.id
                  ? 'border-blue-500 text-white bg-gray-800/50'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="font-mono truncate max-w-[120px]">
                {tab.type === 'session' ? `⚡ ${tab.title}` : `$ ${tab.title}`}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id, tab.type) }}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity ml-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <button
            onClick={handleNewTerminal}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            title="New Terminal"
          >
            <span className="text-sm">+</span>
          </button>
          <button
            onClick={togglePanel}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
            title="Close Panel"
          >
            <span className="text-sm">▼</span>
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
          <TerminalTab
            key={tab.id}
            terminalId={tab.id}
            isActive={tab.id === activeTabId}
          />
        ))}
      </div>
    </div>
  )
}
```

---

## Task 11: Update Layout to include TerminalPanel

**Files:**
- Modify: `src/web/components/Layout.tsx`

- [ ] **Step 1: Add TerminalPanel to Layout**

```tsx
import Header from './Header'
import Sidebar from './Sidebar'
import TerminalPanel from './TerminalPanel'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
          <TerminalPanel />
        </div>
      </div>
    </div>
  )
}
```

---

## Task 12: Add "Open in Terminal" to LogsDrawer and SessionCard

**Files:**
- Modify: `src/web/components/LogsDrawer.tsx`
- Modify: `src/web/components/SessionCard.tsx`

- [ ] **Step 1: Add terminal button to LogsDrawer**

Add an "Open Interactive" button in the LogsDrawer header that attaches the session PTY to a terminal tab:

```tsx
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'

// Inside LogsDrawer component, add handler:
const { addTab, tabs } = useTerminalsStore()

const openInTerminal = () => {
  if (!session) return
  // Check if already attached
  const existing = tabs.find(t => t.sessionId === session.id)
  if (existing) {
    useTerminalsStore.getState().setActiveTab(existing.id)
    useTerminalsStore.getState().setPanelOpen(true)
    return
  }
  // Attach to session PTY
  sendWsMessage({ type: 'terminal.attach', payload: { sessionId: session.id } })
  addTab({
    id: session.id,
    title: `${session.agentId} session`,
    type: 'session',
    sessionId: session.id
  })
  setLogsSessionId(null)  // close drawer
}
```

Add the button next to the close button in the drawer header.

- [ ] **Step 2: Add terminal button to SessionCard**

In SessionCard, add a terminal icon button next to the Logs button for running sessions:

```tsx
import { useTerminalsStore } from '../stores/terminals'
import { sendWsMessage } from '../lib/ws'

// Add handler in SessionCard:
const openTerminal = () => {
  const existing = useTerminalsStore.getState().tabs.find(t => t.sessionId === session.id)
  if (existing) {
    useTerminalsStore.getState().setActiveTab(existing.id)
    useTerminalsStore.getState().setPanelOpen(true)
    return
  }
  sendWsMessage({ type: 'terminal.attach', payload: { sessionId: session.id } })
  useTerminalsStore.getState().addTab({
    id: session.id,
    title: `${session.agentId} session`,
    type: 'session',
    sessionId: session.id
  })
}
```

---

## Task 13: Handle terminal.created response in WS client

**Files:**
- Modify: `src/web/lib/ws.ts`

- [ ] **Step 1: Dispatch terminal.created to store directly**

In the ws.ts `onmessage` handler, update the `terminal.created` case:

```ts
case 'terminal.created': {
  const { terminalId, title, pid } = msg.payload
  useTerminalsStore.getState().addTab({
    id: terminalId,
    title,
    type: 'standalone',
    pid
  })
  break
}
```

Remove the CustomEvent approach from Task 10's TerminalPanel (the `useEffect` listening for `terminal-created` is no longer needed).

---

## Task 14: Verify and test

- [ ] **Step 1: Ensure TypeScript compiles**

```bash
cd /home/sown/workplace/personal/agent-bridge-temote && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 2: Restart dev server and test in browser**

```bash
# Server should auto-restart via tsx watch
# Web should auto-reload via Vite HMR
```

Manual test:
1. Open dashboard
2. Click "Terminal" button at bottom → new bash terminal opens
3. Type commands, verify colors/ANSI work
4. Launch a session → click terminal icon → session PTY attached interactively
5. Type in Claude Code TUI, verify UI renders correctly
6. Resize panel by dragging → terminal re-fits
7. Multiple tabs work
8. Close terminal tabs
