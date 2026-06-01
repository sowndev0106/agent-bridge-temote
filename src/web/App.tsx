import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import Overview from './pages/Overview'
import ProjectWorkspace from './pages/ProjectWorkspace'
import SettingsPage from './pages/SettingsPage'
import Layout from './components/Layout'
import { api, setCsrfToken } from './lib/api'
import { useWebSocket } from './lib/ws'
import { useConfigStore } from './stores/config'
import { useSessionsStore } from './stores/sessions'
import { useProjectsStore } from './stores/projects'
import { useEditorStore } from './stores/editor'

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isW = e.key.toLowerCase() === 'w'
      const isF4 = e.key === 'F4'
      
      const isCtrlW = (e.ctrlKey || e.metaKey) && isW
      const isAltW = e.altKey && isW
      const isCtrlF4 = e.ctrlKey && isF4

      if (isCtrlW || isAltW || isCtrlF4) {
        const currentActive = useEditorStore.getState().activeTabId
        if (currentActive) {
          e.preventDefault()
          e.stopPropagation()
          useEditorStore.getState().closeTab(currentActive)
        }
      }
    }

    // Capture the event as early as possible (useCapture = true)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Layout><Overview /></Layout>} />
      <Route path="/project/:projectId" element={<Layout><ProjectWorkspace /></Layout>} />
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
