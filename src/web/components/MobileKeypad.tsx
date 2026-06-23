import { useState } from 'react'
import { useMediaQuery } from '../lib/useMediaQuery'
import { sendWsMessage } from '../lib/ws'
import {
  encodeNamedKey,
  encodeCtrlLetter,
  encodeAltLetter,
  encodeShiftTab,
  type NamedKey
} from '../lib/terminal-keys'

type Modifier = 'ctrl' | 'alt' | 'shift'

interface Props {
  terminalId: string
}

export default function MobileKeypad({ terminalId }: Props) {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expanded, setExpanded] = useState(false)
  const [armed, setArmed] = useState<Modifier | null>(null)

  if (!isMobile) return null

  const send = (data: string) => {
    sendWsMessage({ type: 'terminal.input', payload: { terminalId, data } })
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  }

  const sendNamed = (name: NamedKey) => {
    send(encodeNamedKey(name))
  }

  const tapModifier = (m: Modifier) => {
    setArmed(prev => (prev === m ? null : m))
  }

  const sendWithArmed = (base: string, mod: Modifier) => {
    if (mod === 'ctrl') send(encodeCtrlLetter(base))
    else if (mod === 'alt') send(encodeAltLetter(base))
    else if (mod === 'shift') send(base.toUpperCase())
    setArmed(null)
  }

  return (
    <div
      data-testid="mobile-keypad"
      className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] select-none"
    >
      {expanded ? (
        <ExpandedSheet
          armed={armed}
          onArm={tapModifier}
          onSendNamed={sendNamed}
          onSendWithArmed={sendWithArmed}
          onSendLiteral={send}
          onCollapse={() => { setExpanded(false); setArmed(null) }}
        />
      ) : (
        <CompactBar
          armed={armed}
          onArm={tapModifier}
          onSendNamed={sendNamed}
          onSendWithArmed={sendWithArmed}
          onExpand={() => setExpanded(true)}
        />
      )}
    </div>
  )
}

// CompactBar and ExpandedSheet are filled in by tasks 4 and 5.
// For now this file is the shell; the imports below are placeholders
// that the next tasks will replace with full implementations.

function CompactBar(props: {
  armed: Modifier | null
  onArm: (m: Modifier) => void
  onSendNamed: (n: NamedKey) => void
  onSendWithArmed: (base: string, mod: Modifier) => void
  onExpand: () => void
}) {
  const { armed, onArm, onSendNamed, onSendWithArmed, onExpand } = props
  return (
    <div className="flex flex-col gap-1 p-1">
      <div className="flex items-center gap-1">
        <KeyButton label="⌃" armed={armed === 'ctrl'} onClick={() => onArm('ctrl')} testId="mod-ctrl" title="Ctrl" />
        <KeyButton label="⎇" armed={armed === 'alt'} onClick={() => onArm('alt')} testId="mod-alt" title="Alt" />
        <KeyButton label="⇧" armed={armed === 'shift'} onClick={() => onArm('shift')} testId="mod-shift" title="Shift" />
        <KeyButton label="Esc" onClick={() => onSendNamed('Escape')} testId="keypad-esc" />
        <KeyButton label="Tab" onClick={() => onSendNamed('Tab')} testId="keypad-tab" />
        <KeyButton label="←" onClick={() => onSendNamed('ArrowLeft')} />
        <KeyButton label="→" onClick={() => onSendNamed('ArrowRight')} />
        <KeyButton label="↑" onClick={() => onSendNamed('ArrowUp')} />
        <KeyButton label="↓" onClick={() => onSendNamed('ArrowDown')} />
        <KeyButton label="⏎" onClick={() => onSendNamed('Enter')} testId="keypad-enter" />
        <KeyButton label="⌨" onClick={onExpand} testId="keypad-toggle" title="Show more keys" />
      </div>
      {armed && (
        <div className="flex items-center gap-1 border-t border-[var(--color-border-subtle)] pt-1" data-testid="keypad-armed-row">
          <span className="px-2 text-xs text-[var(--color-text-secondary)]">{armed.toUpperCase()} armed</span>
          <KeyButton label="C" onClick={() => onSendWithArmed('c', armed)} testId="quick-c" title={`${armed}+C`} />
          <KeyButton label="D" onClick={() => onSendWithArmed('d', armed)} testId="quick-d" title={`${armed}+D`} />
          <KeyButton label="L" onClick={() => onSendWithArmed('l', armed)} testId="quick-l" title={`${armed}+L`} />
          <KeyButton label="R" onClick={() => onSendWithArmed('r', armed)} testId="quick-r" title={`${armed}+R`} />
          <KeyButton label="Z" onClick={() => onSendWithArmed('z', armed)} testId="quick-z" title={`${armed}+Z`} />
          <KeyButton label="⏎" onClick={() => onSendWithArmed('c', armed)} testId="quick-int" title={`Interrupt (${armed}+C)`} />
        </div>
      )}
    </div>
  )
}

function ExpandedSheet(props: {
  armed: Modifier | null
  onArm: (m: Modifier) => void
  onSendNamed: (n: NamedKey) => void
  onSendWithArmed: (base: string, mod: Modifier) => void
  onSendLiteral: (s: string) => void
  onCollapse: () => void
}) {
  const { armed, onArm, onSendNamed, onSendWithArmed, onSendLiteral, onCollapse } = props
  type Tab = 'nav' | 'edit' | 'ctrl' | 'sym'
  const [tab, setTab] = useState<Tab>('nav')

  const sendKey = (name: NamedKey) => onSendNamed(name)
  const sendCtrl = (letter: string) => {
    if (armed === 'alt') onSendWithArmed(letter, 'alt')
    else if (armed === 'shift') onSendWithArmed(letter, 'shift')
    else onSendWithArmed(letter, 'ctrl') // default behavior in Ctrl tab still uses ctrl encoder if no armed
  }
  const sendLiteral = (s: string) => onSendLiteral(armed === 'shift' ? s.toUpperCase() : s)

  return (
    <div className="flex flex-col p-1" data-testid="keypad-expanded">
      <div className="flex items-center gap-1">
        <KeyButton label="×" onClick={onCollapse} testId="keypad-collapse" title="Hide keypad" />
        <TabButton id="nav" active={tab} setActive={setTab}>Nav</TabButton>
        <TabButton id="edit" active={tab} setActive={setTab}>Edit</TabButton>
        <TabButton id="ctrl" active={tab} setActive={setTab}>Ctrl</TabButton>
        <TabButton id="sym" active={tab} setActive={setTab}>123</TabButton>
        <span className="ml-auto px-2 text-xs text-[var(--color-text-secondary)]">
          {armed ? armed.toUpperCase() + ' armed' : 'no modifier'}
        </span>
      </div>

      {tab === 'nav' && (
        <div className="mt-1 grid grid-cols-4 gap-1">
          <KeyButton label="Home" onClick={() => sendKey('Home')} />
          <KeyButton label="End" onClick={() => sendKey('End')} />
          <KeyButton label="PgUp" onClick={() => sendKey('PageUp')} />
          <KeyButton label="PgDn" onClick={() => sendKey('PageDown')} />
          <KeyButton label="↑" onClick={() => sendKey('ArrowUp')} />
          <KeyButton label="↓" onClick={() => sendKey('ArrowDown')} />
          <KeyButton label="←" onClick={() => sendKey('ArrowLeft')} />
          <KeyButton label="→" onClick={() => sendKey('ArrowRight')} />
        </div>
      )}

      {tab === 'edit' && (
        <div className="mt-1 grid grid-cols-4 gap-1">
          <KeyButton label="Esc" onClick={() => sendKey('Escape')} testId="edit-esc" />
          <KeyButton label="Tab" onClick={() => sendKey('Tab')} />
          <KeyButton label="⇧Tab" onClick={() => onSendLiteral(encodeShiftTab())} />
          <KeyButton label="⏎" onClick={() => sendKey('Enter')} />
          <KeyButton label="⌫" onClick={() => sendKey('Backspace')} />
          <KeyButton label="Del" onClick={() => sendKey('Delete')} />
          <KeyButton label="Ins" onClick={() => sendKey('Insert')} />
          <KeyButton label="Space" onClick={() => onSendLiteral(' ')} />
        </div>
      )}

      {tab === 'ctrl' && (
        <div className="mt-1 grid grid-cols-6 gap-1">
          {Array.from({ length: 26 }, (_, i) => {
            const letter = String.fromCharCode(97 + i)
            return (
              <KeyButton
                key={letter}
                label={'^' + letter.toUpperCase()}
                onClick={() => sendCtrl(letter)}
                testId={`ctrl-${letter}`}
              />
            )
          })}
        </div>
      )}

      {tab === 'sym' && (
        <div className="mt-1 grid grid-cols-6 gap-1">
          {[
            { label: '|', send: '|', testId: 'sym-pipe' },
            { label: '~', send: '~', testId: 'sym-tilde' },
            { label: '\\', send: '\\', testId: 'sym-backslash' },
            { label: '`', send: '`', testId: 'sym-backtick' },
            { label: '{', send: '{', testId: 'sym-lbrace' },
            { label: '}', send: '}', testId: 'sym-rbrace' },
            { label: '[', send: '[', testId: 'sym-lbracket' },
            { label: ']', send: ']', testId: 'sym-rbracket' },
            { label: '<', send: '<', testId: 'sym-langle' },
            { label: '>', send: '>', testId: 'sym-rangle' },
            { label: '$', send: '$', testId: 'sym-dollar' },
            { label: '_', send: '_', testId: 'sym-underscore' },
            { label: '"', send: '"', testId: 'sym-dquote' },
            { label: "'", send: "'", testId: 'sym-squote' },
            { label: '=', send: '=', testId: 'sym-eq' },
            { label: '+', send: '+', testId: 'sym-plus' }
          ].map(k => (
            <KeyButton key={k.testId} label={k.label} onClick={() => sendLiteral(k.send)} testId={k.testId} />
          ))}
        </div>
      )}
    </div>
  )
}

function TabButton(props: { id: string; active: string; setActive: (s: any) => void; children: React.ReactNode }) {
  const { id, active, setActive, children } = props
  const isActive = active === id
  return (
    <button
      type="button"
      onClick={() => setActive(id)}
      data-testid={`tab-${id}`}
      className={
        'min-h-9 rounded px-3 text-sm font-medium ' +
        (isActive
          ? 'bg-[var(--color-accent)] text-white'
          : 'bg-[var(--color-bg-overlay)] text-[var(--color-text-primary)]')
      }
    >
      {children}
    </button>
  )
}

function KeyButton(props: {
  label: string
  onClick: () => void
  armed?: boolean
  testId?: string
  title?: string
}) {
  const { label, onClick, armed, testId, title } = props
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title={title}
      className={
        'min-h-9 min-w-9 rounded px-2 text-sm font-medium transition-colors ' +
        (armed
          ? 'bg-[var(--color-accent)] text-white'
          : 'bg-[var(--color-bg-overlay)] text-[var(--color-text-primary)] active:bg-[var(--color-bg-hover)]')
      }
    >
      {label}
    </button>
  )
}
