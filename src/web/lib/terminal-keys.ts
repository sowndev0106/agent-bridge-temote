// Pure encoder for terminal key sequences.
// Used by the mobile keypad to send raw escape sequences to the PTY.
// No DOM, no side effects — just byte strings.

export type NamedKey =
  | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
  | 'Enter' | 'Tab' | 'Escape' | 'Backspace' | 'Delete'
  | 'Home' | 'End' | 'PageUp' | 'PageDown' | 'Insert'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6'
  | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12'

const NAMED: Record<NamedKey, string> = {
  ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
  Enter: '\r', Tab: '\t', Escape: '\x1b', Backspace: '\x7f', Delete: '\x1b[3~',
  Home: '\x1b[H', End: '\x1b[F',
  PageUp: '\x1b[5~', PageDown: '\x1b[6~', Insert: '\x1b[2~',
  F1: '\x1bOP', F2: '\x1bOQ', F3: '\x1bOR', F4: '\x1bOS',
  F5: '\x1b[15~', F6: '\x1b[17~', F7: '\x1b[18~', F8: '\x1b[19~',
  F9: '\x1b[20~', F10: '\x1b[21~', F11: '\x1b[23~', F12: '\x1b[24~'
}

export function encodeNamedKey(name: NamedKey): string {
  const seq = NAMED[name]
  if (seq === undefined) throw new Error(`Unknown key: ${name}`)
  return seq
}

export function encodeCtrlLetter(letter: string): string {
  const lower = letter.toLowerCase()
  if (lower.length !== 1 || lower < 'a' || lower > 'z') {
    throw new Error(`encodeCtrlLetter expects a single letter a–z, got: ${letter}`)
  }
  return String.fromCharCode(lower.charCodeAt(0) - 96) // a=0x01, z=0x1a
}

export function encodeAltLetter(letter: string): string {
  if (letter.length !== 1) throw new Error(`encodeAltLetter expects a single char, got: ${letter}`)
  return '\x1b' + letter
}

export function encodeShiftTab(): string {
  return '\x1b[Z'
}
