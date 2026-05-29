import { create } from 'zustand'

export interface TerminalTabInfo {
  id: string              // terminalId (UUID for standalone, sessionId for attached)
  title: string
  type: 'standalone' | 'session'
  sessionId?: string      // set when type === 'session'
  projectId?: string | null
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
