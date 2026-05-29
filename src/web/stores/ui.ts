import { create } from 'zustand'

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  mobileSidebarOpen: boolean
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
  setMobileSidebarOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  logsSessionId: null,
  mobileSidebarOpen: false,
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id, mobileSidebarOpen: false }),
  setLogsSessionId: (id) => set({ logsSessionId: id }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open })
}))
