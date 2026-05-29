import { useSessionsStore } from '../stores/sessions'
import SessionCard from '../components/SessionCard'
import AgentSelectorModal from '../components/AgentSelectorModal'
import AddProjectModal from '../components/AddProjectModal'
import LogsDrawer from '../components/LogsDrawer'

export default function Dashboard() {
  const { sessions } = useSessionsStore()
  return (
    <>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Active Sessions</p>
      {sessions.length === 0
        ? <p className="text-gray-600 text-sm">No active sessions. Select a project in the sidebar to launch an agent.</p>
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sessions.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        )}
      <AgentSelectorModal />
      <AddProjectModal />
      <LogsDrawer />
    </>
  )
}
