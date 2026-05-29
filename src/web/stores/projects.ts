import { create } from 'zustand'
import type { Project } from '../../types'

interface ProjectsStore {
  projects: Project[]
  setProjects: (projects: Project[]) => void
  addProject: (p: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  removeProject: (id: string) => void
}

export const useProjectsStore = create<ProjectsStore>((set) => ({
  projects: [],
  setProjects: (projects) => set({ projects }),
  addProject: (p) => set(state => ({ projects: [...state.projects, p] })),
  updateProject: (id, patch) =>
    set(state => ({ projects: state.projects.map(p => p.id === id ? { ...p, ...patch } : p) })),
  removeProject: (id) => set(state => ({ projects: state.projects.filter(p => p.id !== id) }))
}))
