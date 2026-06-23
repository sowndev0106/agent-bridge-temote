import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MobileKeypad from '../../../src/web/components/MobileKeypad'

let matches = true
vi.mock('../../../src/web/lib/useMediaQuery', () => ({
  useMediaQuery: () => matches
}))

beforeEach(() => {
  matches = true
  // @ts-expect-error - stub for navigator.vibrate
  global.navigator.vibrate = vi.fn()
})

// RTL's auto-cleanup only registers when `afterEach` is a global. With vitest's
// default config (no `globals: true`), afterEach must be explicitly imported.
afterEach(() => cleanup())

describe('MobileKeypad', () => {
  it('renders null on desktop', () => {
    matches = false
    const { container } = render(<MobileKeypad terminalId="t-1" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders toggle button on mobile', () => {
    render(<MobileKeypad terminalId="t-1" />)
    expect(screen.getByTestId('keypad-toggle')).toBeInTheDocument()
  })

  it('compact bar shows Esc, Tab, Enter and all three modifier toggles', () => {
    render(<MobileKeypad terminalId="t-1" />)
    expect(screen.getByTestId('keypad-esc')).toBeInTheDocument()
    expect(screen.getByTestId('keypad-tab')).toBeInTheDocument()
    expect(screen.getByTestId('keypad-enter')).toBeInTheDocument()
    expect(screen.getByTestId('mod-ctrl')).toBeInTheDocument()
    expect(screen.getByTestId('mod-alt')).toBeInTheDocument()
    expect(screen.getByTestId('mod-shift')).toBeInTheDocument()
    expect(screen.getByTestId('keypad-toggle')).toBeInTheDocument()
  })
})
