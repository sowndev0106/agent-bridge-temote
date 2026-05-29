import type { Session, SessionState } from '../../types'

export function shortId(id: string): string {
  return '#' + id.slice(-4)
}

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso))
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function formatDuration(fromIso: string, toIso: string | number = Date.now()): string {
  const to = typeof toIso === 'number' ? toIso : Date.parse(toIso)
  const diff = Math.max(0, to - Date.parse(fromIso))
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM ? `${h}h ${remM}m` : `${h}h`
}

/** Wall-clock time of a timestamp, e.g. "14:32". */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Day bucket label for grouping: "Today", "Yesterday", a weekday, or "May 27". */
export function dayLabel(iso: string, now: number = Date.now()): string {
  const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  const days = Math.round((startOfDay(now) - startOfDay(Date.parse(iso))) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const d = new Date(iso)
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function initials(name: string): string {
  const chars = (name.match(/[a-z0-9]/gi) ?? []).slice(0, 2)
  return chars.length ? chars.join('').toUpperCase() : '?'
}

export function projectHue(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

/** Stable, vivid avatar background for a project (single source of truth). */
export function projectColor(id: string): string {
  return `hsl(${projectHue(id)} 62% 46%)`
}

export const STATE_RANK: Record<SessionState, number> = {
  running: 0, launching: 1, failed: 2, stopped: 3
}

export function compareSessions(a: Session, b: Session): number {
  const r = STATE_RANK[a.state] - STATE_RANK[b.state]
  if (r !== 0) return r
  return Date.parse(b.startedAt) - Date.parse(a.startedAt)
}
