import Header from './Header'
import Sidebar from './Sidebar'
import TerminalPanel from './TerminalPanel'
import { useUIStore } from '../stores/ui'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useUIStore()

  return (
    <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        {mobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close project navigation"
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="rb-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4 lg:px-6 lg:py-6">{children}</main>
          <TerminalPanel />
        </div>
      </div>
    </div>
  )
}
