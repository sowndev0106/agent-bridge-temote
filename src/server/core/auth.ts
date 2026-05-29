import bcrypt from 'bcryptjs'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const { compare, hash } = bcrypt
const BCRYPT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  if (!hashed) return false
  return compare(password, hashed)
}

interface SessionPayload {
  [key: string]: unknown
  exp: number
}

export function signSession(data: Record<string, unknown>, secret: string, ttlSeconds: number): string {
  const payload: SessionPayload = { ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${sig}`
}

export function verifySession(token: string, secret: string): Record<string, unknown> | null {
  try {
    const [encoded, sig] = token.split('.')
    if (!encoded || !sig) return null
    const expectedSig = createHmac('sha256', secret).update(encoded).digest('base64url')
    const expectedBuf = Buffer.from(expectedSig)
    const actualBuf = Buffer.from(sig)
    if (expectedBuf.length !== actualBuf.length) return null
    if (!timingSafeEqual(expectedBuf, actualBuf)) return null
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function generateSecret(): string {
  return randomBytes(32).toString('hex')
}
