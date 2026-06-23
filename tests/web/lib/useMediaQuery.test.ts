import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '../../../src/web/lib/useMediaQuery'

type Listener = (e: { matches: boolean }) => void
const listeners: Listener[] = []
let currentMatches = false

beforeEach(() => {
  listeners.length = 0
  currentMatches = false
  ;(window as any).matchMedia = vi.fn().mockImplementation((q: string) => ({
    get matches() { return currentMatches },
    media: q,
    onchange: null,
    addEventListener: (_: string, cb: Listener) => { listeners.push(cb) },
    removeEventListener: () => { /* noop */ },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true
  }))
})

describe('useMediaQuery', () => {
  it('returns current match state', () => {
    currentMatches = true
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'))
    expect(result.current).toBe(true)
  })

  it('updates when matchMedia change event fires', () => {
    currentMatches = false
    const { result } = renderHook(() => useMediaQuery('(max-width: 640px)'))
    expect(result.current).toBe(false)
    act(() => {
      currentMatches = true
      listeners.forEach(l => l({ matches: true }))
    })
    expect(result.current).toBe(true)
  })
})
