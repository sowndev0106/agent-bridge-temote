interface Entry { count: number; resetAt: number }

export class RateLimiter {
  private store = new Map<string, Entry>()
  private maxRequests: number
  private windowMs: number

  constructor({ maxRequests, windowMs }: { maxRequests: number; windowMs: number }) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  check(ip: string): boolean {
    const now = Date.now()
    let entry = this.store.get(ip)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs }
      this.store.set(ip, entry)
    }
    entry.count++
    return entry.count <= this.maxRequests
  }
}
