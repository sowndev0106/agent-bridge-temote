import { writeFile, readFile, mkdir, rename, chmod } from 'fs/promises'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await chmod(dir, 0o700)
}

export async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath)
  await ensureDir(dir)
  const tmp = join(dir, `.tmp-${randomBytes(8).toString('hex')}`)
  const json = JSON.stringify(data, null, 2)
  await writeFile(tmp, json, { encoding: 'utf-8', mode: 0o600 })
  await rename(tmp, filePath)
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
