/**
 * Sync atom search index — generates embeddings and upserts into atom_search_index.
 *
 * Usage:
 *   npx tsx src/scripts/sync-atom-embeddings.ts
 *
 * Required env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ZAI_API_KEY (or ZAI_PLANNER_API_KEY)
 */

import { syncAtomSearchIndex } from '../lib/atoms/atom-embeddings'

async function main() {
  console.log('Syncing atom search index...')
  const result = await syncAtomSearchIndex()
  console.log(`Synced ${result.synced} atoms`)
  if (result.errors.length > 0) {
    console.warn('Errors:')
    for (const err of result.errors) {
      console.warn(`  - ${err}`)
    }
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exitCode = 1
})
