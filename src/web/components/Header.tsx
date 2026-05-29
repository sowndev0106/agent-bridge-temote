import { LogOut, Menu, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useConfigStore } from '../stores/config'
import { useUIStore } from '../stores/ui'

const WARNING_DISMISSED_KEY = 'rb-exposure-warning-dismissed'

export default function Header() {
  const { wsConnected, config } = useConfigStore()
  const { setMobileSidebarOpen } = useUIStore()
  const navigate = useNavigate()
  const publicHost = Boolean(config?.host && config.host !== '127.0.0.1')
  const [warningDismissed, setWarningDismissed] = useState(
    () => localStorage.getItem(WARNING_DISMISSED_KEY) === '1'
  )

  const dismissWarning = () => {
    localStorage.setItem(WARNING_DISMISSED_KEY, '1')
    setWarningDismissed(true)
  }

  const logout = async () => {
    await api.logout().catch(() => {})
    navigate('/login')
  }

  return (
    <div className="shrink-0 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      {publicHost && !warningDismissed && (
        <div className="flex min-h-10 items-center gap-2 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-xs text-[var(--color-text-secondary)] sm:px-4">
          <span className="font-semibold text-[var(--color-warning)]">Warning</span>
          <span className="min-w-0 flex-1 truncate">
            RemoteBridge is exposed on {config?.host}. Ensure your firewall and password are configured.
          </span>
          <button
            type="button"
            onClick={dismissWarning}
            aria-label="Dismiss warning"
            title="Dismiss"
            className="rb-focus -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <header className="flex h-12 items-center justify-between gap-3 px-3 sm:px-4" role="banner">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Open project navigation"
            title="Projects"
            className="rb-icon-button md:hidden"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-dim)] font-mono text-[11px] font-semibold text-[var(--color-accent)]">
              RB
            </span>
            <span className="truncate text-sm font-semibold text-[var(--color-text-primary)] sm:text-[15px]">
              RemoteBridge
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-[var(--color-text-secondary)] sm:flex">
            <span
              className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-[var(--color-running)]' : 'bg-[var(--color-stopped)]'}`}
              style={wsConnected ? { animation: 'rb-pulse 3s ease-in-out infinite' } : undefined}
            />
            <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
          </span>
          <Link to="/settings" aria-label="Open settings" title="Settings" className="rb-icon-button">
            <Settings size={17} />
          </Link>
          <button type="button" onClick={logout} aria-label="Logout" title="Logout" className="rb-icon-button">
            <LogOut size={17} />
          </button>
        </div>
      </header>
    </div>
  )
}
