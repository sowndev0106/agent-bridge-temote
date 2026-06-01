import { useUIStore } from '../stores/ui'
import { useSessionsStore } from '../stores/sessions'
import { Clipboard, ExternalLink } from 'lucide-react'

export default function CodexRemoteModal() {
  const { codexRemoteSessionId, setCodexRemoteSessionId, addToast } = useUIStore()
  const { sessions } = useSessionsStore()
  const session = sessions.find(s => s.id === codexRemoteSessionId)

  if (!codexRemoteSessionId || !session) return null

  const copyToClipboard = () => {
    if (session.remoteLink) {
      navigator.clipboard.writeText(session.remoteLink)
      addToast('Copied WebSocket link to clipboard!', 'info')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setCodexRemoteSessionId(null)}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-6 shadow-[var(--shadow-modal)]"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Codex Remote Control</h2>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          OpenAI Codex runs a local WebSocket server to bridge connections to remote workspaces securely.
        </p>

        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">WebSocket Endpoint</label>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="rb-mono truncate text-xs text-[var(--color-accent)]">{session.remoteLink}</span>
            <button onClick={copyToClipboard} className="rb-icon-button shrink-0" title="Copy to clipboard">
              <Clipboard size={14} />
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          <h3 className="font-semibold text-[var(--color-text-primary)]">Quick Instructions:</h3>
          <ul className="list-disc pl-4 space-y-1 text-[var(--color-text-secondary)]">
            <li>Open VS Code Settings and search for <code className="rb-mono bg-[var(--color-bg-hover)] px-1 rounded">Codex: Remote Address</code>.</li>
            <li>Paste the copied WebSocket link into the field.</li>
            <li>Alternatively, scan the local desktop QR code to pair your <strong>ChatGPT Mobile App</strong>.</li>
          </ul>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={() => setCodexRemoteSessionId(null)} className="rb-ghost-button text-xs">Close</button>
          <a
            href="https://chatgpt.com/codex"
            target="_blank"
            rel="noopener noreferrer"
            className="rb-primary-button flex items-center justify-center gap-1.5 text-xs text-center"
          >
            Open ChatGPT Workspace <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}
