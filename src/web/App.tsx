import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import LoginPage from './pages/LoginPage'
import Overview from './pages/Overview'
import ProjectWorkspace from './pages/ProjectWorkspace'
import SettingsPage from './pages/SettingsPage'
import Layout from './components/Layout'
import { api, setCsrfToken } from './lib/api'
import { useWebSocket, sendWsMessage } from './lib/ws'
import { useConfigStore } from './stores/config'
import { useSessionsStore } from './stores/sessions'
import { useProjectsStore } from './stores/projects'
import { useEditorStore } from './stores/editor'
import { useTerminalsStore, loadPersistedSessionTabs } from './stores/terminals'

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
  const wsConnected = useConfigStore(s => s.wsConnected)
  const [sessionsFetched, setSessionsFetched] = useState(false)
  const restoredTabsRef = useRef(false)

  useEffect(() => {
    api.getSessions()
      .then(s => useSessionsStore.getState().setSessions(s))
      .catch(() => {})
      .finally(() => setSessionsFetched(true))
    api.getProjects().then(p => useProjectsStore.getState().setProjects(p)).catch(() => {})
  }, [])

  // After a reload, re-open terminal tabs for sessions that are still running.
  // Runs once both the WebSocket is open (so terminal.attach is delivered) and
  // the session list has been fetched (so we know which sessions still exist).
  useEffect(() => {
    if (restoredTabsRef.current) return
    if (!wsConnected || !sessionsFetched) return
    restoredTabsRef.current = true

    const saved = loadPersistedSessionTabs()
    if (saved.length === 0) return
    const sessions = useSessionsStore.getState().sessions
    const terminals = useTerminalsStore.getState()

    for (const tab of saved) {
      const session = sessions.find(s => s.id === tab.sessionId)
      // Skip sessions that were deleted, stopped, or are Codex (chat UI, not a PTY tab).
      if (!session) continue
      if (session.agentId === 'codex') continue
      if (session.state !== 'running' && session.state !== 'launching') continue
      if (terminals.tabs.some(t => t.sessionId === session.id)) continue

      sendWsMessage({ type: 'terminal.attach', payload: { sessionId: session.id } })
      terminals.addTab({
        id: session.id,
        title: tab.title,
        type: 'session',
        sessionId: session.id,
        projectId: session.projectId
      })
    }
  }, [wsConnected, sessionsFetched])

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
