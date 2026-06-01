import { describe, it, expect } from 'vitest'
import { extractLink } from '../../src/server/sessions/link-extractor.js'

describe('extractLink', () => {
  const claudePattern = 'https://claude\\.ai/code/session_[\\w]+'

  it('extracts Claude remote link from stdout line', () => {
    // Verified against claude v2.1.156: stdout line is
    // "/remote-control is active · Continue here, on your phone, or at  https://claude.ai/code/session_<ULID>"
    const line = '/remote-control is active · Continue here, on your phone, or at  https://claude.ai/code/session_01HjuhkefR1roLvgeB2xizbG'
    expect(extractLink(line, claudePattern)).toBe('https://claude.ai/code/session_01HjuhkefR1roLvgeB2xizbG')
  })

  it('returns null when no link in line', () => {
    expect(extractLink('Starting Claude Code...', claudePattern)).toBeNull()
  })

  it('returns null for partial match that does not fit pattern', () => {
    expect(extractLink('https://evil.com/inject', claudePattern)).toBeNull()
  })

  it('uses generic pattern as fallback', () => {
    const generic = 'https?://[^\\s]+'
    expect(extractLink('Visit https://example.com/session', generic)).toBe('https://example.com/session')
  })

  it('extracts Codex remote WebSocket link from stdout', () => {
    const line = 'listening on: ws://127.0.0.1:4098'
    const codexPattern = 'ws://127.0.0.1:\\d+'
    expect(extractLink(line, codexPattern)).toBe('ws://127.0.0.1:4098')
  })
})
