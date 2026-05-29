import { describe, it, expect } from 'vitest'
import { generateCsrfToken, verifyCsrfToken } from '../../src/server/core/csrf.js'
import { RateLimiter } from '../../src/server/core/rate-limit.js'

describe('csrf', () => {
  it('verify returns true for valid token', () => {
    const { token, hash } = generateCsrfToken()
    expect(verifyCsrfToken(token, hash)).toBe(true)
  })

  it('verify returns false for tampered token', () => {
    const { hash } = generateCsrfToken()
    expect(verifyCsrfToken('tampered', hash)).toBe(false)
  })
})

describe('RateLimiter', () => {
  it('allows requests under the limit', () => {
    const rl = new RateLimiter({ maxRequests: 3, windowMs: 60_000 })
    expect(rl.check('1.2.3.4')).toBe(true)
    expect(rl.check('1.2.3.4')).toBe(true)
    expect(rl.check('1.2.3.4')).toBe(true)
  })

  it('blocks after limit exceeded', () => {
    const rl = new RateLimiter({ maxRequests: 2, windowMs: 60_000 })
    rl.check('1.2.3.4')
    rl.check('1.2.3.4')
    expect(rl.check('1.2.3.4')).toBe(false)
  })
})
