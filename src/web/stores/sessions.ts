import { create } from 'zustand'
import type { Session } from '../../types'

interface SessionsStore {
  sessions: Session[]
  setSessions: (sessions: Session[]) => void
  addSession: (s: Session) => void
  updateSession: (id: string, patch: Partial<Session>) => void
  appendLog: (id: string, line: string) => void
  removeSession: (id: string) => void
}

export const useSessionsStore = create<SessionsStore>((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  addSession: (s) => set(state => ({ sessions: [...state.sessions, s] })),
  updateSession: (id, patch) =>
    set(state => ({ sessions: state.sessions.map(s => s.id === id ? { ...s, ...patch } : s) })),
  appendLog: (id, line) =>
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === id ? { ...s, logs: [...s.logs.slice(-499), line] } : s
      )
    })),
  removeSession: (id) => set(state => ({ sessions: state.sessions.filter(s => s.id !== id) }))
}))
