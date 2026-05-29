import { describe, it, expect } from 'vitest'
import {
  shortId, formatRelativeTime, formatDuration, initials, projectHue,
  STATE_RANK, compareSessions
} from '../../src/web/lib/format'
import type { Session } from '../../src/types'

const T0 = Date.parse('2026-05-29T12:00:00.000Z')

describe('shortId', () => {
  it('takes the last 4 chars, prefixed with #', () => {
    expect(shortId('abc123def456')).toBe('#f456')
  })
  it('handles short ids without crashing', () => {
    expect(shortId('a1')).toBe('#a1')
  })
})

describe('formatRelativeTime', () => {
  it('shows "just now" under a minute', () => {
    expect(formatRelativeTime('2026-05-29T11:59:30.000Z', T0)).toBe('just now')
  })
  it('shows minutes, hours, days', () => {
    expect(formatRelativeTime('2026-05-29T11:55:00.000Z', T0)).toBe('5m ago')
    expect(formatRelativeTime('2026-05-29T09:00:00.000Z', T0)).toBe('3h ago')
    expect(formatRelativeTime('2026-05-27T12:00:00.000Z', T0)).toBe('2d ago')
  })
})

describe('formatDuration', () => {
  it('formats minutes and hours between two times', () => {
    expect(formatDuration('2026-05-29T11:55:00.000Z', '2026-05-29T12:00:00.000Z')).toBe('5m')
    expect(formatDuration('2026-05-29T10:30:00.000Z', '2026-05-29T12:00:00.000Z')).toBe('1h 30m')
  })
  it('uses seconds under a minute', () => {
    expect(formatDuration('2026-05-29T11:59:50.000Z', '2026-05-29T12:00:00.000Z')).toBe('10s')
  })
})

describe('initials', () => {
  it('uppercases the first two alphanumeric chars', () => {
    expect(initials('agent-bridge-temote')).toBe('AG')
    expect(initials('one-lotte')).toBe('ON')
    expect(initials('x')).toBe('X')
    expect(initials('')).toBe('?')
  })
})

describe('projectHue', () => {
  it('is deterministic and within 0..359', () => {
    const h = projectHue('proj-1')
    expect(h).toBe(projectHue('proj-1'))
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(360)
  })
  it('differs for different ids (usually)', () => {
    expect(projectHue('proj-1')).not.toBe(projectHue('proj-2'))
  })
})

describe('compareSessions', () => {
  const mk = (state: Session['state'], startedAt: string): Session => ({
    id: state + startedAt, projectId: 'p', agentId: 'claude', pid: null,
    state, remoteLink: null, logs: [], startedAt, stoppedAt: null, error: null
  })
  it('orders running < launching < failed < stopped, then newest first', () => {
    expect(STATE_RANK.running).toBeLessThan(STATE_RANK.stopped)
    const list = [
      mk('stopped', '2026-05-29T11:00:00.000Z'),
      mk('running', '2026-05-29T10:00:00.000Z'),
      mk('running', '2026-05-29T11:00:00.000Z'),
      mk('failed', '2026-05-29T11:00:00.000Z')
    ].sort(compareSessions)
    expect(list.map(s => `${s.state}@${s.startedAt.slice(11,16)}`))
      .toEqual(['running@11:00', 'running@10:00', 'failed@11:00', 'stopped@11:00'])
  })
})
