import { create } from 'zustand'

export interface EditorTab {
  id: string          // unique = `${projectId}:${path}`
  projectId: string
  path: string        // project-relative path
  title: string       // basename
  dirty: boolean
}

interface EditorStore {
  tabs: EditorTab[]
  activeTabId: string | null
  openFile: (projectId: string, path: string) => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
  setDirty: (id: string, dirty: boolean) => void
  closeProjectTabs: (projectId: string) => void
}

const tabId = (projectId: string, path: string) => `${projectId}:${path}`
const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export const useEditorStore = create<EditorStore>((set) => ({
  tabs: [],
  activeTabId: null,
  openFile: (projectId, path) => set(state => {
    const id = tabId(projectId, path)
    if (state.tabs.some(t => t.id === id)) return { activeTabId: id }
    return {
      tabs: [...state.tabs, { id, projectId, path, title: basename(path), dirty: false }],
      activeTabId: id
    }
  }),
  closeTab: (id) => set(state => {
    const tabs = state.tabs.filter(t => t.id !== id)
    const activeTabId = state.activeTabId === id
      ? (tabs.length ? tabs[tabs.length - 1].id : null)
      : state.activeTabId
    return { tabs, activeTabId }
  }),
  setActive: (id) => set({ activeTabId: id }),
  setDirty: (id, dirty) => set(state => ({
    tabs: state.tabs.map(t => t.id === id ? { ...t, dirty } : t)
  })),
  closeProjectTabs: (projectId) => set(state => {
    const tabs = state.tabs.filter(t => t.projectId !== projectId)
    return { tabs, activeTabId: tabs.length ? tabs[tabs.length - 1].id : null }
  })
}))
