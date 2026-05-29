import { useState } from 'react'
import { useUIStore } from '../stores/ui'
import { useProjectsStore } from '../stores/projects'
import { api } from '../lib/api'

function parseEnv(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw.split('\n')
      .map(l => l.trim())
      .filter(l => l.includes('='))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
  )
}

export default function AddProjectModal() {
  const { addProjectOpen, setAddProjectOpen } = useUIStore()
  const { addProject } = useProjectsStore()
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [envRaw, setEnvRaw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!addProjectOpen) return null

  const save = async () => {
    setError(''); setLoading(true)
    try {
      const project = await api.createProject({ name, path, env: parseEnv(envRaw) })
      addProject(project)
      setAddProjectOpen(false)
      setName(''); setPath(''); setEnvRaw('')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAddProjectOpen(false)}>
      <div className="bg-gray-900 rounded-xl p-6 w-96 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-white">Add Project</h2>
          <button onClick={() => setAddProjectOpen(false)} className="text-gray-500 hover:text-white">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Absolute Path *</label>
            <input value={path} onChange={e => setPath(e.target.value)}
              placeholder="/home/user/projects/my-app"
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Environment Variables (optional, KEY=VALUE per line)</label>
            <textarea value={envRaw} onChange={e => setEnvRaw(e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm font-mono resize-none" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => setAddProjectOpen(false)} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">Cancel</button>
          <button onClick={save} disabled={loading || !name || !path} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Saving…' : 'Save Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
