import { create } from 'zustand'

const COLLAPSE_KEY = 'rb-sidebar-collapsed'
const initialCollapsed = (() => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
})()

export interface Toast {
  id: string
  message: string
  type: 'error' | 'info'
}

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  mobileSidebarOpen: boolean
  sidebarCollapsed: boolean
  toasts: Toast[]
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  logsSessionId: null,
  mobileSidebarOpen: false,
  sidebarCollapsed: initialCollapsed,
  toasts: [],
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id, mobileSidebarOpen: false }),
  setLogsSessionId: (id) => set({ logsSessionId: id }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  toggleSidebar: () => set(state => {
    const next = !state.sidebarCollapsed
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
    return { sidebarCollapsed: next }
  }),
  addToast: (message, type = 'error') => {
    const id = Math.random().toString(36).slice(2)
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })), 4000)
  },
  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
}))
