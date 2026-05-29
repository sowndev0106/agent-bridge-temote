import { create } from 'zustand'

const COLLAPSE_KEY = 'rb-sidebar-collapsed'
const initialCollapsed = (() => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
})()

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  mobileSidebarOpen: boolean
  sidebarCollapsed: boolean
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  logsSessionId: null,
  mobileSidebarOpen: false,
  sidebarCollapsed: initialCollapsed,
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id, mobileSidebarOpen: false }),
  setLogsSessionId: (id) => set({ logsSessionId: id }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  toggleSidebar: () => set(state => {
    const next = !state.sidebarCollapsed
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
    return { sidebarCollapsed: next }
  })
}))
