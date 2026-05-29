import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setCsrfToken } from '../lib/api'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { csrfToken } = await api.login(password)
      setCsrfToken(csrfToken)
      navigate('/')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-bg-base)] px-4 py-8">
      <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 shadow-[var(--shadow-modal)] sm:p-8">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-dim)] font-mono text-xs font-semibold text-[var(--color-accent)]">RB</span>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">RemoteBridge</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="rb-input"
            autoFocus
          />
          {error && <p className="break-words text-sm text-[var(--color-failed)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rb-primary-button w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
