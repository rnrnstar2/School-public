import { createClient } from '@supabase/supabase-js'
import { type Page } from '@playwright/test'
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_OWNER_EMAIL,
  TEST_OWNER_PASSWORD,
  LOCAL_SUPABASE_URL,
  ensureOwnerUser,
  ensureTestUser,
} from './db'

/**
 * Auth helpers for Playwright E2E.
 *
 * Two strategies are exposed:
 *
 * 1. `mockSupabaseAuth(page)` — intercepts every Supabase auth/REST request
 *    with fulfilled fixtures. Zero dependency on a running Supabase stack.
 *    Fast, but does not exercise real RLS policies or DB queries. Used by the
 *    legacy specs that were written before the local-DB story existed.
 *
 * 2. `loginAsTestUser(page)` — creates a real session token via the admin
 *    client and primes Supabase's session cookies in the browser. Requires
 *    the local Supabase stack to be reachable (see `./db.ts`). When the stack
 *    is not available this helper returns `false` so specs can fall back to
 *    mock auth or skip themselves.
 *
 * Design choice: we intentionally do NOT walk the /login form UI in helper
 * code — that would couple every spec to the login page's markup and make
 * debug traces much noisier. Specs that specifically test the login UI should
 * still do so directly.
 */

/**
 * Mock Supabase auth & DB calls so pages can render without a real backend.
 * Intercepts common Supabase REST + auth endpoints at the network layer.
 *
 * Keep this for legacy specs and for tests where the assertion has nothing to
 * do with the data layer (landing page, marketing pages, etc.).
 */
export async function mockSupabaseAuth(page: Page) {
  await page.route('**/auth/v1/token*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: {
          id: 'mock-user-id',
          email: 'test@example.com',
          role: 'authenticated',
        },
      }),
    }),
  )

  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-user-id',
        email: 'test@example.com',
        role: 'authenticated',
      }),
    }),
  )

  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    })
  })
}

/**
 * Prime Supabase SSR cookies for the deterministic test user using a password
 * sign-in session. Returns `true` on success, `false` when the local stack is
 * unreachable or session creation fails.
 *
 * This is faster than walking the /login form and is robust against
 * form-markup churn.
 */

/**
 * Resolve the base URL of the app under test.
 *
 * Playwright passes the port via `PLAYWRIGHT_WEB_PORT`. Fall back to the
 * default dev-server port (3200) when neither env var is set.
 */
function getAppBaseURL(): string {
  if (process.env.PLAYWRIGHT_BASE_URL) return process.env.PLAYWRIGHT_BASE_URL
  const port = process.env.PLAYWRIGHT_WEB_PORT ?? '3200'
  // Use 127.0.0.1 (not localhost) so addCookies() and browser navigation
  // share the same origin.
  return `http://127.0.0.1:${port}`
}

function buildSupabaseCookieChunks(name: string, value: string) {
  const maxChunkSize = 3180

  if (encodeURIComponent(value).length <= maxChunkSize) {
    return [{ name, value }]
  }

  const chunks: Array<{ name: string; value: string }> = []
  let remaining = value

  while (remaining.length > 0) {
    chunks.push({
      name: `${name}.${chunks.length}`,
      value: remaining.slice(0, maxChunkSize),
    })
    remaining = remaining.slice(maxChunkSize)
  }

  return chunks
}

async function loginAsUser(page: Page, params: {
  email: string
  password: string
  ensureUser: () => Promise<{ id: string } | null>
}): Promise<boolean> {
  try {
    const ensured = await params.ensureUser()
    if (!ensured) return false

    const appBaseURL = getAppBaseURL()

    // ── Pre-flight: verify the Next.js server uses the local Supabase stack ──
    // Locally-minted tokens are only valid for the local Supabase instance.
    // PLAYWRIGHT_NEXTJS_SUPABASE_URL is set by global-setup.ts after reading
    // .env.local from the app root.
    const nextjsSupabaseURL =
      process.env.PLAYWRIGHT_NEXTJS_SUPABASE_URL ?? LOCAL_SUPABASE_URL
    const serverUsesLocalStack =
      new URL(nextjsSupabaseURL).hostname === new URL(LOCAL_SUPABASE_URL).hostname

    if (!serverUsesLocalStack) {
      console.warn(
        `[e2e/auth] Skipping real-auth login: the Next.js server uses ` +
          `${nextjsSupabaseURL} but the local test stack is at ${LOCAL_SUPABASE_URL}. ` +
          `Locally-minted tokens are invalid for the server's Supabase instance. ` +
          `Start the dev server with NEXT_PUBLIC_SUPABASE_URL=${LOCAL_SUPABASE_URL} ` +
          `(e.g. add NEXT_PUBLIC_SUPABASE_URL=${LOCAL_SUPABASE_URL} to .env.test.local) ` +
          `to enable @db:real specs.`,
      )
      return false
    }

    // @supabase/ssr cookie name is derived from the Supabase URL hostname prefix.
    const supabaseRef = new URL(nextjsSupabaseURL).hostname.split('.')[0]
    const cookieName = `sb-${supabaseRef}-auth-token`

    // ── signInWithPassword: avoids OTP one-time-use race conditions ──
    // Multiple parallel tests calling generateLink for the same email would
    // invalidate each other's tokens. signInWithPassword can be called
    // concurrently safely.
    const LOCAL_ANON_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    const anonClient = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    })
    if (signInError || !signInData.session) {
      console.warn('[e2e/auth] signInWithPassword failed:', signInError?.message)
      return false
    }

    const session = signInData.session
    const cookieValue = JSON.stringify(session)

    // @supabase/ssr's default cookieEncoding is base64url. It checks for the
    // "base64-" prefix and decodes the JSON session transparently.
    const base64CookieValue = 'base64-' + Buffer.from(cookieValue).toString('base64url')
    const appOrigin = new URL(appBaseURL).origin

    await page.context().addCookies(
      buildSupabaseCookieChunks(cookieName, base64CookieValue).map((cookie) => ({
        ...cookie,
        // Use domain+path (not url) so the cookie lands on the 127.0.0.1 origin.
        // Playwright treats url and domain/path as mutually exclusive.
        domain: '127.0.0.1',
        path: '/',
        sameSite: 'Lax' as const,
        secure: false,
        httpOnly: false,
        expires: Math.floor(Date.now() / 1000) + 34560000,
      })),
    )

    // Navigate to the app root so Next.js middleware refreshes the session
    // and React components hydrate with the authenticated state.
    await page.goto(appBaseURL)
    return true
  } catch (error) {
    console.warn(
      '[e2e/auth] login failed:',
      error instanceof Error ? error.message : error,
    )
    return false
  }
}

export async function loginAsTestUser(page: Page): Promise<boolean> {
  return loginAsUser(page, {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    ensureUser: ensureTestUser,
  })
}

export async function loginAsOwner(page: Page): Promise<boolean> {
  return loginAsUser(page, {
    email: TEST_OWNER_EMAIL,
    password: TEST_OWNER_PASSWORD,
    ensureUser: ensureOwnerUser,
  })
}
