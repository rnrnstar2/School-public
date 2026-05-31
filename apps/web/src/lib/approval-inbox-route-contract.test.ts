import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const approvalInboxDir = path.resolve(
  import.meta.dirname,
  '../app/dev/journeys/approval-inbox',
)

type TestDefinition = (name: string, fn: () => Promise<void> | void) => void

const globalTestApi = globalThis as typeof globalThis & {
  describe: TestDefinition
  it: TestDefinition
}
const describeCompat = globalTestApi.describe
const itCompat = globalTestApi.it

describeCompat('approval inbox route contract', () => {
  itCompat('does not import createServiceClient in page.tsx or actions.ts', async () => {
    const pageSource = await readFile(
      path.join(approvalInboxDir, 'page.tsx'),
      'utf8',
    )
    const actionSource = await readFile(
      path.join(approvalInboxDir, 'actions.ts'),
      'utf8',
    )

    assert.equal(pageSource.includes('createServiceClient'), false)
    assert.equal(actionSource.includes('createServiceClient'), false)
  })
})
