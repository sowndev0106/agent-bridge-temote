import { useProjectsStore } from '../stores/projects'
import { useUIStore } from '../stores/ui'

export default function Sidebar() {
  const { projects } = useProjectsStore()
  const { setAddProjectOpen, setAgentSelectorProjectId } = useUIStore()

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col p-3 gap-2 overflow-y-auto shrink-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1">Projects</p>
      {projects.map(p => (
        <button
          key={p.id}
          onClick={() => setAgentSelectorProjectId(p.id)}
          className="text-left p-2 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <p className="text-sm font-medium text-white truncate">{p.name}</p>
          <p className="text-xs text-gray-500 truncate">{p.path}</p>
        </button>
      ))}
      <button
        onClick={() => setAddProjectOpen(true)}
        className="mt-auto text-sm text-gray-400 hover:text-white py-2 border border-dashed border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
      >
        + Add Project
      </button>
    </aside>
  )
}
