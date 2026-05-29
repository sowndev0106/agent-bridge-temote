export function extractLink(line: string, pattern: string): string | null {
  try {
    const regex = new RegExp(pattern)
    const match = line.match(regex)
    return match ? match[0] : null
  } catch {
    return null
  }
}
