import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, signSession, verifySession } from '../../src/server/core/auth.js'

describe('auth', () => {
  it('hashPassword produces a bcrypt hash', async () => {
    const hash = await hashPassword('secret')
    expect(hash).toMatch(/^\$2[ab]\$/)
  })

  it('verifyPassword returns true for correct password', async () => {
    const hash = await hashPassword('correct')
    expect(await verifyPassword('correct', hash)).toBe(true)
  })

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('correct')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('signSession + verifySession roundtrip', () => {
    const secret = 'test-secret-32-chars-long-enough!'
    const token = signSession({ userId: '1' }, secret, 3600)
    const payload = verifySession(token, secret)
    expect(payload).not.toBeNull()
    expect((payload as { userId: string }).userId).toBe('1')
  })

  it('verifySession returns null for expired session', () => {
    const secret = 'test-secret-32-chars-long-enough!'
    const token = signSession({ userId: '1' }, secret, -1)
    expect(verifySession(token, secret)).toBeNull()
  })

  it('verifySession returns null for tampered token', () => {
    const secret = 'test-secret-32-chars-long-enough!'
    const token = signSession({ userId: '1' }, secret, 3600)
    expect(verifySession(token + 'x', secret)).toBeNull()
  })
})
