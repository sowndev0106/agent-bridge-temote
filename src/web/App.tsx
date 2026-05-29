import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import SettingsPage from './pages/SettingsPage'
import Layout from './components/Layout'
import { api, setCsrfToken } from './lib/api'
import { useWebSocket } from './lib/ws'
import { useConfigStore } from './stores/config'
import { useSessionsStore } from './stores/sessions'
import { useProjectsStore } from './stores/projects'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    // Verify session and refresh CSRF token in parallel — both require valid session cookie.
    // getCsrf() must succeed before any mutations can work after a page refresh.
    Promise.all([api.getConfig(), api.getCsrf()])
      .then(([cfg, { csrfToken }]) => {
        useConfigStore.getState().setConfig(cfg)
        setCsrfToken(csrfToken)
        setAuthed(true)
      })
      .catch(() => setAuthed(false))
  }, [])

  if (authed === null) return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppInner() {
  useWebSocket()

  useEffect(() => {
    api.getSessions().then(s => useSessionsStore.getState().setSessions(s)).catch(() => {})
    api.getProjects().then(p => useProjectsStore.getState().setProjects(p)).catch(() => {})
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Layout><Dashboard /></Layout>} />
      <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<AuthGuard><AppInner /></AuthGuard>} />
      </Routes>
    </BrowserRouter>
  )
}
