import { useState } from 'react'
import { LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useConfigStore } from '../stores/config'
import { useUIStore } from '../stores/ui'

const WARNING_DISMISSED_KEY = 'rb-exposure-warning-dismissed'

export default function TitleBar() {
  const { wsConnected, config } = useConfigStore()
  const { toggleMobileSidebar } = useUIStore()
  const navigate = useNavigate()
  const publicHost = Boolean(config?.host && config.host !== '127.0.0.1')
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(WARNING_DISMISSED_KEY) === '1')

  const logout = async () => { await api.logout().catch(() => {}); navigate('/login') }

  return (
    <div className="shrink-0">
      {publicHost && !dismissed && (
        <div className="flex min-h-8 items-center gap-2 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-warning)]">Warning</span>
          <span className="min-w-0 flex-1 truncate">Agent Remote Control is exposed on {config?.host}. Ensure your firewall and password are configured.</span>
          <button type="button" onClick={() => { localStorage.setItem(WARNING_DISMISSED_KEY, '1'); setDismissed(true) }} aria-label="Dismiss warning" className="rb-icon-button h-6 w-6">×</button>
        </div>
      )}
      <header role="banner" className="flex h-8 items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMobileSidebar}
            aria-label="Toggle navigation menu"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] md:hidden mr-1"
          >
            <Menu size={16} />
          </button>
          <span className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-dim)] font-mono text-[10px] font-semibold text-[var(--color-accent)]">RB</span>
          <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">Agent Remote Control</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <span className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-[var(--color-running)]' : 'bg-[var(--color-stopped)]'}`} style={wsConnected ? { animation: 'rb-pulse 3s ease-in-out infinite' } : undefined} />
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
          <button type="button" onClick={logout} aria-label="Logout" title="Logout" className="rb-icon-button h-6 w-6"><LogOut size={15} /></button>
        </div>
      </header>
    </div>
  )
}
