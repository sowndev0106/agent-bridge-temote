import { create } from 'zustand'

export interface TerminalTabInfo {
  id: string              // terminalId (UUID for standalone, sessionId for attached)
  title: string
  type: 'standalone' | 'session'
  sessionId?: string      // set when type === 'session'
  projectId?: string | null
  pid?: number
}

// Persisted shape for restoring session tabs after a browser reload. We only
// persist session-backed tabs (the agent process survives server-side, so we
// can re-attach). Standalone shell tabs are intentionally not persisted —
// their PTY has no server-side scrollback to replay.
export interface PersistedSessionTab {
  sessionId: string
  projectId: string | null
  title: string
}

const SESSION_TABS_KEY = 'arc.openSessionTabs'

function persistSessionTabs(tabs: TerminalTabInfo[]): void {
  try {
    const sessionTabs: PersistedSessionTab[] = tabs
      .filter((t): t is TerminalTabInfo & { sessionId: string } => t.type === 'session' && !!t.sessionId)
      .map(t => ({ sessionId: t.sessionId, projectId: t.projectId ?? null, title: t.title }))
    localStorage.setItem(SESSION_TABS_KEY, JSON.stringify(sessionTabs))
  } catch {
    /* localStorage unavailable (private mode / quota) — restore is best-effort */
  }
}

export function loadPersistedSessionTabs(): PersistedSessionTab[] {
  try {
    const raw = localStorage.getItem(SESSION_TABS_KEY)
    return raw ? (JSON.parse(raw) as PersistedSessionTab[]) : []
  } catch {
    return []
  }
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

// Persist the set of open session tabs to localStorage on every change so a
// browser reload can re-open and re-attach to still-running agent sessions.
let lastPersisted = ''
useTerminalsStore.subscribe((state) => {
  const key = state.tabs.filter(t => t.type === 'session').map(t => `${t.sessionId}:${t.title}`).join('|')
  if (key === lastPersisted) return   // skip non-tab changes (panelHeight, activeTab, …)
  lastPersisted = key
  persistSessionTabs(state.tabs)
})
