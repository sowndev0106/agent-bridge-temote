import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MobileKeypad from '../../../src/web/components/MobileKeypad'
import { sendWsMessage } from '../../../src/web/lib/ws'

vi.mock('../../../src/web/lib/ws', () => ({ sendWsMessage: vi.fn() }))

let matches = true
vi.mock('../../../src/web/lib/useMediaQuery', () => ({
  useMediaQuery: () => matches
}))

beforeEach(() => {
  matches = true
  vi.mocked(sendWsMessage).mockClear()
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

  it('Tapping the same modifier twice disarms it', () => {
    render(<MobileKeypad terminalId="t-1" />)
    const ctrl = screen.getByTestId('mod-ctrl')
    fireEvent.click(ctrl)
    fireEvent.click(ctrl)
    expect(ctrl.className).not.toContain('bg-[var(--color-accent)]')
  })

  it('Tapping Ctrl then quick-c sends 0x03 via sendWsMessage and disarms', () => {
    render(<MobileKeypad terminalId="t-99" />)
    fireEvent.click(screen.getByTestId('mod-ctrl'))
    expect(screen.getByTestId('keypad-armed-row')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('quick-c'))
    expect(sendWsMessage).toHaveBeenCalledWith({
      type: 'terminal.input',
      payload: { terminalId: 't-99', data: '\x03' }
    })
    expect(screen.queryByTestId('keypad-armed-row')).toBeNull()
  })

  it('expanded sheet renders all four tabs', () => {
    render(<MobileKeypad terminalId="t-1" />)
    fireEvent.click(screen.getByTestId('keypad-toggle'))
    expect(screen.getByTestId('tab-nav')).toBeInTheDocument()
    expect(screen.getByTestId('tab-edit')).toBeInTheDocument()
    expect(screen.getByTestId('tab-ctrl')).toBeInTheDocument()
    expect(screen.getByTestId('tab-sym')).toBeInTheDocument()
  })

  it('Ctrl tab shows A–Z grid; tapping ^R sends 0x12', () => {
    render(<MobileKeypad terminalId="t-7" />)
    fireEvent.click(screen.getByTestId('keypad-toggle'))
    fireEvent.click(screen.getByTestId('tab-ctrl'))
    expect(screen.getByTestId('ctrl-r')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('ctrl-r'))
    expect(sendWsMessage).toHaveBeenCalledWith({
      type: 'terminal.input',
      payload: { terminalId: 't-7', data: '\x12' }
    })
  })

  it('Sym tab has pipe, tilde, backslash, backtick, braces', () => {
    render(<MobileKeypad terminalId="t-1" />)
    fireEvent.click(screen.getByTestId('keypad-toggle'))
    fireEvent.click(screen.getByTestId('tab-sym'))
    expect(screen.getByTestId('sym-pipe')).toBeInTheDocument()
    expect(screen.getByTestId('sym-tilde')).toBeInTheDocument()
    expect(screen.getByTestId('sym-backslash')).toBeInTheDocument()
    expect(screen.getByTestId('sym-backtick')).toBeInTheDocument()
    expect(screen.getByTestId('sym-lbrace')).toBeInTheDocument()
    expect(screen.getByTestId('sym-rbrace')).toBeInTheDocument()
  })

  it('collapse button returns to compact bar', () => {
    render(<MobileKeypad terminalId="t-1" />)
    fireEvent.click(screen.getByTestId('keypad-toggle'))
    fireEvent.click(screen.getByTestId('keypad-collapse'))
    expect(screen.getByTestId('keypad-toggle')).toBeInTheDocument()
    // toggle button in compact bar is the same test id; confirm no tabs anymore
    expect(screen.queryByTestId('tab-nav')).toBeNull()
  })
})
