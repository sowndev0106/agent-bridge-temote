import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'error' | 'info'
}

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  toasts: Toast[]
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  logsSessionId: null,
  toasts: [],
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id }),
  setLogsSessionId: (id) => set({ logsSessionId: id }),
  addToast: (message, type = 'error') => {
    const id = Math.random().toString(36).slice(2)
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })), 4000)
  },
  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
}))
