import { describe, it, expect, beforeEach } from 'vitest'
import { useTerminalsStore, loadPersistedSessionTabs } from '../../../src/web/stores/terminals'

// Reset store + localStorage between tests so persisted state never leaks.
beforeEach(() => {
  localStorage.clear()
  useTerminalsStore.setState({ tabs: [], activeTabId: null, panelOpen: false, panelHeight: 35 })
})

describe('terminals store session-tab persistence', () => {
  it('persists session tabs to localStorage on add', () => {
    useTerminalsStore.getState().addTab({
      id: 'sess-1',
      title: 'claude abc',
      type: 'session',
      sessionId: 'sess-1',
      projectId: 'proj-1'
    })

    const saved = loadPersistedSessionTabs()
    expect(saved).toEqual([{ sessionId: 'sess-1', projectId: 'proj-1', title: 'claude abc' }])
  })

  it('does NOT persist standalone shell tabs', () => {
    useTerminalsStore.getState().addTab({
      id: 'term-1',
      title: 'Terminal 1',
      type: 'standalone',
      projectId: 'proj-1'
    })

    expect(loadPersistedSessionTabs()).toEqual([])
  })

  it('removes a session tab from localStorage when its tab is closed', () => {
    const { addTab, removeTab } = useTerminalsStore.getState()
    addTab({ id: 'sess-1', title: 'a', type: 'session', sessionId: 'sess-1', projectId: null })
    addTab({ id: 'sess-2', title: 'b', type: 'session', sessionId: 'sess-2', projectId: null })

    removeTab('sess-1')

    const saved = loadPersistedSessionTabs()
    expect(saved.map(t => t.sessionId)).toEqual(['sess-2'])
  })

  it('returns [] when localStorage holds malformed JSON', () => {
    localStorage.setItem('arc.openSessionTabs', '{not valid json')
    expect(loadPersistedSessionTabs()).toEqual([])
  })
})
