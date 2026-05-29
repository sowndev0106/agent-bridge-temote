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
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-400 w-36">{label}</label>
      <input
        type={type}
        value={String(form[key] ?? '')}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="w-48 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  )

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-white mb-6">⚙ Settings</h1>
      <div className="bg-gray-900 rounded-xl p-6 space-y-6">
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Network</p>
          <div className="space-y-3">
            {field('port', 'Port', 'number')}
            {field('host', 'Host')}
          </div>
        </section>
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Session Behavior</p>
          <div className="space-y-3">
            {field('linkExtractTimeout', 'Link Timeout (s)', 'number')}
            {field('maxConcurrentSessions', 'Max Sessions', 'number')}
            {field('keepSessionLogsLines', 'Log Lines', 'number')}
          </div>
        </section>
        <section>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Logging</p>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-400 w-36">Log Level</label>
            <select
              value={String(form.logLevel ?? 'info')}
              onChange={e => setForm(f => ({ ...f, logLevel: e.target.value as SafeConfig['logLevel'] }))}
              className="w-48 px-3 py-1.5 bg-gray-800 text-white rounded-lg border border-gray-700 text-sm"
            >
              {['debug', 'info', 'warn', 'error'].map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </section>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={() => { setForm(config); setError('') }} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
            Reset
          </button>
          <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
