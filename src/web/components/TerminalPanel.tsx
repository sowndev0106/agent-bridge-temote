import { useRef, useCallback } from 'react'
import { useTerminalsStore, type TerminalTabInfo } from '../stores/terminals'
import TerminalTab from './TerminalTab'
import { sendWsMessage } from '../lib/ws'

export default function TerminalPanel() {
  const { tabs, activeTabId, panelOpen, panelHeight, removeTab, setActiveTab, togglePanel, setPanelHeight } = useTerminalsStore()
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const handleNewTerminal = () => {
    console.log('[TerminalPanel] handleNewTerminal clicked')
    sendWsMessage({ type: 'terminal.create', payload: {} })
  }

  const handleCloseTab = (id: string, type: TerminalTabInfo['type']) => {
    console.log('[TerminalPanel] handleCloseTab clicked:', id, 'type:', type)
    if (type === 'standalone') {
      sendWsMessage({ type: 'terminal.close', payload: { terminalId: id } })
    }
    removeTab(id)
  }

  // Drag-to-resize
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: panelHeight }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      const vh = window.innerHeight
      const newHeight = dragRef.current.startHeight + (delta / vh) * 100
      setPanelHeight(newHeight)
    }

    const handleUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [panelHeight, setPanelHeight])

  if (!panelOpen || tabs.length === 0) {
    return (
      <div className="border-t border-gray-800 bg-gray-950 flex-shrink-0">
        <div className="flex items-center px-3 py-1.5">
          <button
            onClick={handleNewTerminal}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            title="New Terminal"
          >
            <span className="text-base leading-none">⌘</span>
            <span>Terminal</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="border-t border-gray-700 bg-gray-950 flex flex-col flex-shrink-0"
      style={{ height: `${panelHeight}vh` }}
    >
      {/* Drag handle */}
      <div
        className="h-1 cursor-row-resize bg-gray-800 hover:bg-blue-500/50 transition-colors flex-shrink-0"
        onMouseDown={handleDragStart}
      />

      {/* Tab bar */}
      <div className="flex items-center bg-gray-900/80 border-b border-gray-800 flex-shrink-0 px-1">
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors group ${
                activeTabId === tab.id
                  ? 'border-blue-500 text-white bg-gray-800/50'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="font-mono truncate max-w-[120px]">
                {tab.type === 'session' ? `⚡ ${tab.title}` : `$ ${tab.title}`}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id, tab.type) }}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity ml-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-2 flex-shrink-0 px-2 py-1">
          <button
            onClick={handleNewTerminal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-sm"
            title="New Standalone Terminal"
          >
            <span>+</span>
            <span>Shell</span>
          </button>
          <button
            onClick={togglePanel}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-semibold text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1"
            title="Collapse Panel"
          >
            <span>▼</span>
            <span>Hide</span>
          </button>
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
          <TerminalTab
            key={tab.id}
            terminalId={tab.id}
            isActive={tab.id === activeTabId}
          />
        ))}
      </div>
    </div>
  )
}
