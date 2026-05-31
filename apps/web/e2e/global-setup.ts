import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensureTestUser, resetTestUserData, seedTestPlan, isLocalSupabaseReady } from './helpers/db'

/**
 * Detect the Supabase URL that the Next.js dev server uses so that E2E auth
 * helpers can derive the correct @supabase/ssr cookie name.
 *
 * When the dev server is started manually (reuseExistingServer=true) it reads
 * `.env.local` and may use a different URL than the default local stack.
 * We read the same `.env.local` file here so the auth helper can generate a
 * session cookie under the name the server actually expects.
 *
 * Two environment variables are managed:
 *
 *   PLAYWRIGHT_LOCAL_SUPABASE_URL — URL of the *local* Supabase instance used
 *     as the test DB (always http://localhost:54341 unless explicitly overridden).
 *     db.ts uses this to connect to the local admin API.
 *
 *   PLAYWRIGHT_NEXTJS_SUPABASE_URL — URL that the *Next.js server* passes to
 *     createServerClient / createBrowserClient. This determines the @supabase/ssr
 *     cookie name the server expects. Defaults to the value from .env.local, or
 *     falls back to PLAYWRIGHT_LOCAL_SUPABASE_URL.
 */
function detectNextjsSupabaseURL(): void {
  // Ensure the local DB URL is set (used by db.ts).
  if (!process.env.PLAYWRIGHT_LOCAL_SUPABASE_URL) {
    process.env.PLAYWRIGHT_LOCAL_SUPABASE_URL = 'http://127.0.0.1:54341'
  }

  // Already set by the caller — don't override the Next.js server URL.
  if (process.env.PLAYWRIGHT_NEXTJS_SUPABASE_URL) return

  // Try to read NEXT_PUBLIC_SUPABASE_URL from env files in the app root.
  // Next.js precedence: .env.development.local > .env.local > .env.development > .env
  // Check .env.development.local first so E2E tests honour the same override
  // that causes the dev server to use the local Supabase stack.
  const envFiles = ['.env.development.local', '.env.local']
  for (const envFile of envFiles) {
    try {
      const content = readFileSync(resolve(__dirname, '..', envFile), 'utf8')
      const match = content.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$/m)
      if (match) {
        const url = match[1].trim()
        process.env.PLAYWRIGHT_NEXTJS_SUPABASE_URL = url
        console.log(`[e2e/global-setup] detected Next.js Supabase URL from ${envFile}: ${url}`)
        return
      }
    } catch {
      // file does not exist — try next
    }
  }

  // playwright.config.ts forces the Next.js server to use the local URL
  // when it starts the server itself (non-reuse mode).
  process.env.PLAYWRIGHT_NEXTJS_SUPABASE_URL =
    process.env.PLAYWRIGHT_LOCAL_SUPABASE_URL
}

/**
 * Playwright global setup — runs once before any spec.
 *
 * Responsibilities:
 *   1. Ensure the deterministic E2E test user exists in auth.users.
 *   2. Reset E2E-owned rows so tests start from a clean slate.
 *   3. Seed a minimal learner_state row so returning-user scenarios have
 *      something to hydrate from.
 *
 * When the local Supabase stack is NOT running every step degrades to a
 * no-op (the underlying helpers log a single warning). Specs that rely on a
 * real DB should gate themselves with `isLocalSupabaseReady()` so they skip
 * cleanly instead of failing hard. Legacy specs that mock everything still
 * pass regardless of DB availability.
 */
export default async function globalSetup() {
  // Must run before any DB helpers so LOCAL_SUPABASE_URL is initialised.
  detectNextjsSupabaseURL()

  const user = await ensureTestUser()
  if (!user) {
    console.warn(
      '[e2e/global-setup] skipping DB seed — local Supabase stack is not reachable.',
    )
    return
  }

  await resetTestUserData(user.id)
  await seedTestPlan(user.id)

  if (isLocalSupabaseReady()) {
    console.log('[e2e/global-setup] test user + plan seeded OK.')
  }
}
