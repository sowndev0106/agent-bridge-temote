import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useUIStore } from '../stores/ui'
import { useEditorStore } from '../stores/editor'
import ActivityBar from './ActivityBar'
import PrimarySidebar from './PrimarySidebar'

export default function MobileSidebar() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useUIStore()
  const activeTabId = useEditorStore(s => s.activeTabId)
  const location = useLocation()

  // Close sidebar drawer automatically on navigation/route change or tab change
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname, activeTabId, setMobileSidebarOpen])

  if (!mobileSidebarOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-start bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 animate-fade-in"
      onClick={() => setMobileSidebarOpen(false)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="flex h-full w-[310px] max-w-[85vw] border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-2xl transition-transform duration-300 ease-out animate-slide-in-left"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex h-full w-full overflow-hidden">
          <ActivityBar />
          <div className="flex min-w-0 flex-1 flex-col">
            <PrimarySidebar />
          </div>
        </div>
      </section>
    </div>
  )
}
