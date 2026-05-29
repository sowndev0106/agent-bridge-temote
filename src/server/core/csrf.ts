import { randomBytes, createHash, timingSafeEqual } from 'crypto'

export function generateCsrfToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url')
  const hash = createHash('sha256').update(token).digest('base64url')
  return { token, hash }
}

export function verifyCsrfToken(token: string, storedHash: string): boolean {
  try {
    const hash = createHash('sha256').update(token).digest('base64url')
    const a = Buffer.from(hash)
    const b = Buffer.from(storedHash)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
