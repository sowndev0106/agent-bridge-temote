import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'error' | 'info'
}

const PROJECT_ORDER_KEY = 'arc.projectOrder'

function readProjectOrder(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PROJECT_ORDER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeProjectOrder(ids: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(ids))
  } catch {
    // Persistence is best-effort; keep the in-memory UI state responsive.
  }
}

interface UIStore {
  addProjectOpen: boolean
  agentSelectorProjectId: string | null
  deleteProjectId: string | null
  logsSessionId: string | null
  projectSidebarExpanded: boolean
  projectOrder: string[]
  mobileSidebarOpen: boolean
  toasts: Toast[]
  setAddProjectOpen: (open: boolean) => void
  setAgentSelectorProjectId: (id: string | null) => void
  setDeleteProjectId: (id: string | null) => void
  setLogsSessionId: (id: string | null) => void
  setProjectSidebarExpanded: (expanded: boolean) => void
  toggleProjectSidebarExpanded: () => void
  setMobileSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
  setProjectOrder: (ids: string[]) => void
  moveProject: (id: string, direction: -1 | 1) => void
  removeProjectFromOrder: (id: string) => void
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIStore>((set) => ({
  addProjectOpen: false,
  agentSelectorProjectId: null,
  deleteProjectId: null,
  logsSessionId: null,
  projectSidebarExpanded: false,
  projectOrder: readProjectOrder(),
  mobileSidebarOpen: false,
  toasts: [],
  setAddProjectOpen: (open) => set({ addProjectOpen: open }),
  setAgentSelectorProjectId: (id) => set({ agentSelectorProjectId: id }),
  setDeleteProjectId: (id) => set({ deleteProjectId: id }),
  setLogsSessionId: (id) => set({ logsSessionId: id }),
  setProjectSidebarExpanded: (expanded) => set({ projectSidebarExpanded: expanded }),
  toggleProjectSidebarExpanded: () => set(state => ({ projectSidebarExpanded: !state.projectSidebarExpanded })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  toggleMobileSidebar: () => set(state => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  setProjectOrder: (ids) => {
    writeProjectOrder(ids)
    set({ projectOrder: ids })
  },
  moveProject: (id, direction) => set(state => {
    const currentIndex = state.projectOrder.indexOf(id)
    const nextIndex = currentIndex + direction
    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= state.projectOrder.length) {
      return state
    }

    const projectOrder = [...state.projectOrder]
    const [projectId] = projectOrder.splice(currentIndex, 1)
    projectOrder.splice(nextIndex, 0, projectId)
    writeProjectOrder(projectOrder)

    return { projectOrder }
  }),
  removeProjectFromOrder: (id) => set(state => {
    const projectOrder = state.projectOrder.filter(projectId => projectId !== id)
    writeProjectOrder(projectOrder)
    return { projectOrder }
  }),
  addToast: (message, type = 'error') => {
    const id = Math.random().toString(36).slice(2)
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })), 4000)
  },
  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
}))
