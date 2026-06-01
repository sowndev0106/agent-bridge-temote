import { X } from 'lucide-react'
import { useUIStore } from '../stores/ui'

export default function Toaster() {
  const { toasts, removeToast } = useUIStore()
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-sm shadow-lg ${
            t.type === 'error'
              ? 'border-[var(--color-failed)]/30 bg-[var(--color-bg-overlay)] text-[var(--color-failed)]'
              : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-overlay)] text-[var(--color-text-primary)]'
          }`}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            className="mt-0.5 shrink-0 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
