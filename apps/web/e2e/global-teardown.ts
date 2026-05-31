import { resetTestUserData, isLocalSupabaseReady } from './helpers/db'

/**
 * Playwright global teardown — runs once after every spec finishes.
 *
 * Keeps the deterministic test user around (creating it is expensive and
 * idempotent) but wipes the user-scoped rows so the next run starts clean.
 *
 * No-op when the local Supabase stack is not reachable.
 */
export default async function globalTeardown() {
  if (!isLocalSupabaseReady()) return
  await resetTestUserData()
}
