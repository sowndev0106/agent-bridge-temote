import { create } from 'zustand'

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  logsSessionId: string | null
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  logsSessionId: null,
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id }),
  setLogsSessionId: (id) => set({ logsSessionId: id })
}))
