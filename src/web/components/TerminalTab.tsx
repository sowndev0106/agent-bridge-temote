import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { sendWsMessage } from '../lib/ws'

interface TerminalTabProps {
  terminalId: string
  isActive: boolean
}

export default function TerminalTab({ terminalId, isActive }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: '#0b0d12',
        foreground: '#e4e8f4',
        cursor: '#3b82f6',
        cursorAccent: '#0b0d12',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
        black: '#1e2230',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e8f4',
        brightBlack: '#4e5a72',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f8fafc'
      },
      scrollback: 2000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term
    fitAddonRef.current = fitAddon

    // Send initial size
    sendWsMessage({
      type: 'terminal.resize',
      payload: { terminalId, cols: term.cols, rows: term.rows }
    })

    // User input → server
    term.onData((data) => {
      sendWsMessage({
        type: 'terminal.input',
        payload: { terminalId, data }
      })
    })

    // Server output → terminal
    const handleData = (e: Event) => {
      const detail = (e as CustomEvent).detail as { terminalId: string; data: string }
      if (detail.terminalId === terminalId) {
        term.write(detail.data)
      }
    }
    window.addEventListener('terminal-data', handleData)

    // Resize observer
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      sendWsMessage({
        type: 'terminal.resize',
        payload: { terminalId, cols: term.cols, rows: term.rows }
      })
    })
    observer.observe(containerRef.current)

    return () => {
      window.removeEventListener('terminal-data', handleData)
      observer.disconnect()
      term.dispose()
    }
  }, [terminalId])

  // Re-fit when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 50)
    }
  }, [isActive])

  useEffect(() => {
    const refit = () => fitAddonRef.current?.fit()
    window.addEventListener('resize', refit)
    window.addEventListener('orientationchange', refit)
    return () => {
      window.removeEventListener('resize', refit)
      window.removeEventListener('orientationchange', refit)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  )
}
