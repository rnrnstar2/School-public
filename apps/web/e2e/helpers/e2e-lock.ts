import { mkdir, rmdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withE2ELock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockDir = path.join(os.tmpdir(), `school-e2e-${name}.lock`)

  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      await mkdir(lockDir)
      try {
        return await fn()
      } finally {
        await rmdir(lockDir).catch(() => undefined)
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        await wait(250)
        continue
      }

      throw error
    }
  }

  throw new Error(`Timed out waiting for E2E lock: ${name}`)
}
