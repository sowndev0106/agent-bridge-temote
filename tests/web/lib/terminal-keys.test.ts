import { describe, it, expect } from 'vitest'
import { encodeNamedKey, encodeCtrlLetter, encodeAltLetter, encodeShiftTab } from '../../../src/web/lib/terminal-keys'

describe('encodeNamedKey', () => {
  it('returns escape sequences for arrow keys', () => {
    expect(encodeNamedKey('ArrowUp')).toBe('\x1b[A')
    expect(encodeNamedKey('ArrowDown')).toBe('\x1b[B')
    expect(encodeNamedKey('ArrowRight')).toBe('\x1b[C')
    expect(encodeNamedKey('ArrowLeft')).toBe('\x1b[D')
  })
  it('returns CR for Enter (PTY expects \\r)', () => {
    expect(encodeNamedKey('Enter')).toBe('\r')
  })
  it('returns TAB for Tab', () => {
    expect(encodeNamedKey('Tab')).toBe('\t')
  })
  it('returns ESC for Escape', () => {
    expect(encodeNamedKey('Escape')).toBe('\x1b')
  })
  it('returns DEL (0x7f) for Backspace', () => {
    expect(encodeNamedKey('Backspace')).toBe('\x7f')
  })
  it('returns xterm Delete sequence for Delete', () => {
    expect(encodeNamedKey('Delete')).toBe('\x1b[3~')
  })
  it('returns Home/End sequences', () => {
    expect(encodeNamedKey('Home')).toBe('\x1b[H')
    expect(encodeNamedKey('End')).toBe('\x1b[F')
  })
  it('returns PageUp/PageDown sequences', () => {
    expect(encodeNamedKey('PageUp')).toBe('\x1b[5~')
    expect(encodeNamedKey('PageDown')).toBe('\x1b[6~')
  })
  it('returns F1–F4 with SS3 sequence', () => {
    expect(encodeNamedKey('F1')).toBe('\x1bOP')
    expect(encodeNamedKey('F2')).toBe('\x1bOQ')
    expect(encodeNamedKey('F3')).toBe('\x1bOR')
    expect(encodeNamedKey('F4')).toBe('\x1bOS')
  })
  it('returns F5–F12 with CSI sequence', () => {
    expect(encodeNamedKey('F5')).toBe('\x1b[15~')
    expect(encodeNamedKey('F12')).toBe('\x1b[24~')
  })
  it('throws on unknown key', () => {
    // @ts-expect-error testing runtime guard
    expect(() => encodeNamedKey('NotAKey')).toThrow()
  })
})

describe('encodeCtrlLetter', () => {
  it('maps a–z to 0x01–0x1a', () => {
    expect(encodeCtrlLetter('a')).toBe('\x01')
    expect(encodeCtrlLetter('c')).toBe('\x03')
    expect(encodeCtrlLetter('z')).toBe('\x1a')
  })
  it('is case-insensitive', () => {
    expect(encodeCtrlLetter('C')).toBe('\x03')
  })
  it('throws on non-letter', () => {
    expect(() => encodeCtrlLetter('1')).toThrow()
  })
})

describe('encodeAltLetter', () => {
  it('prepends ESC to the letter', () => {
    expect(encodeAltLetter('b')).toBe('\x1bb')
    expect(encodeAltLetter('B')).toBe('\x1bB')
    expect(encodeAltLetter('\t')).toBe('\x1b\t')
  })
  it('throws on multi-char input', () => {
    expect(() => encodeAltLetter('Tab')).toThrow()
  })
})

describe('encodeShiftTab', () => {
  it('returns CSI Z', () => {
    expect(encodeShiftTab()).toBe('\x1b[Z')
  })
})
