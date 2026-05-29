import { useState } from 'react'
import { useConfigStore } from '../stores/config'
import { api } from '../lib/api'
import type { AppConfig } from '../../types'

type SafeConfig = Omit<AppConfig, 'password' | 'sessionSecret'>

export default function SettingsPage() {
  const { config, setConfig } = useConfigStore()
  const [form, setForm] = useState<Partial<SafeConfig>>(config ?? {})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (!config) return null

  const save = async () => {
    setError(''); setSaved(false)
    try {
      const updated = await api.updateConfig(form)
      setConfig(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      setError((err as Error).message)
    }
  }

  const field = (key: keyof SafeConfig, label: string, type = 'text') => (
    <label className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
      <input
        type={type}
        value={String(form[key] ?? '')}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="rb-input"
      />
    </label>
  )

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-5 text-lg font-semibold text-[var(--color-text-primary)]">Settings</h1>
      <div className="space-y-6 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4 shadow-[var(--shadow-card)] sm:p-6">
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Network</p>
          <div className="space-y-3">
            {field('port', 'Port', 'number')}
            {field('host', 'Host')}
          </div>
        </section>
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Session Behavior</p>
          <div className="space-y-3">
            {field('linkExtractTimeout', 'Link Timeout (s)', 'number')}
            {field('maxConcurrentSessions', 'Max Sessions', 'number')}
            {field('keepSessionLogsLines', 'Log Lines', 'number')}
          </div>
        </section>
        <section>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Logging</p>
          <label className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-3">
            <span className="text-sm text-[var(--color-text-secondary)]">Log Level</span>
            <select
              value={String(form.logLevel ?? 'info')}
              onChange={e => setForm(f => ({ ...f, logLevel: e.target.value as SafeConfig['logLevel'] }))}
              className="rb-input"
            >
              {['debug', 'info', 'warn', 'error'].map(l => <option key={l}>{l}</option>)}
            </select>
          </label>
        </section>
        {error && <p className="break-words text-sm text-[var(--color-failed)]">{error}</p>}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" onClick={() => { setForm(config); setError('') }} className="rb-ghost-button px-4">
            Reset
          </button>
          <button type="button" onClick={save} className="rb-primary-button px-4">
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
