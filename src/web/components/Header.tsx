import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useConfigStore } from '../stores/config'

export default function Header() {
  const { wsConnected, config } = useConfigStore()
  const navigate = useNavigate()

  const logout = async () => {
    await api.logout().catch(() => {})
    navigate('/login')
  }

  return (
    <header className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
      <span className="text-white font-semibold">🌉 RemoteBridge</span>
      <div className="flex items-center gap-3">
        <span className={`text-xs ${wsConnected ? 'text-green-400' : 'text-gray-500'}`}>
          {wsConnected ? '● Connected' : '○ Disconnected'}
        </span>
        {config?.host && config.host !== '127.0.0.1' && (
          <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
            ⚠ Public ({config.host})
          </span>
        )}
        <Link to="/settings" className="text-gray-400 hover:text-white text-sm">⚙</Link>
        <button onClick={logout} className="text-gray-400 hover:text-white text-sm">Logout</button>
      </div>
    </header>
  )
}
