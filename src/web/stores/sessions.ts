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
  addSession: (s) => set(state => {
    const exists = state.sessions.some(x => x.id === s.id)
    if (exists) return {} // Already added by WS! Keep the WS one because it might have a newer state.
    return { sessions: [...state.sessions, s] }
  }),
  updateSession: (id, patch) =>
    set(state => {
      const exists = state.sessions.some(s => s.id === id)
      if (!exists) {
        if (patch.id && patch.state) {
          return { sessions: [...state.sessions, patch as Session] }
        }
        return {}
      }
      return { sessions: state.sessions.map(s => s.id === id ? { ...s, ...patch } : s) }
    }),
  appendLog: (id, line) =>
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === id ? { ...s, logs: [...s.logs.slice(-499), line] } : s
      )
    })),
  removeSession: (id) => set(state => ({ sessions: state.sessions.filter(s => s.id !== id) }))
}))
