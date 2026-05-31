import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the AI School web app.
 *
 * The Next dev server listens on :3200 (see `apps/web/package.json`), and the
 * local Supabase stack on :54341 (see `apps/web/supabase/config.toml`). Those
 * two values must match the real-world setup or the webServer will never come
 * up — guard against future drift by keeping the env vars here in sync with
 * those source-of-truth files.
 *
 * ── How the local Supabase URL flows through the test stack ─────────────────
 *
 * For `@db:real` specs to work the Next.js server and the E2E auth helpers must
 * both agree on which Supabase instance is being used:
 *
 *   PLAYWRIGHT_LOCAL_SUPABASE_URL (default: http://localhost:54341)
 *     → passed to Next.js via webServer.env as NEXT_PUBLIC_SUPABASE_URL
 *     → also read by e2e/helpers/db.ts and e2e/helpers/auth.ts to derive the
 *       @supabase/ssr cookie name used for session injection
 *
 * If you run `pnpm dev` manually with a different Supabase URL (e.g. the cloud
 * project) and reuse that server with PLAYWRIGHT_WEB_PORT, set
 * PLAYWRIGHT_LOCAL_SUPABASE_URL to that same URL so the auth helper can inject
 * a cookie under the correct name.
 */

const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT ?? '3200'

/**
 * The Supabase URL that the Next.js server will use (and that E2E helpers use
 * to derive the @supabase/ssr session cookie name).
 *
 * Override with PLAYWRIGHT_LOCAL_SUPABASE_URL when testing against a non-
 * default Supabase stack.
 */
const LOCAL_SUPABASE_URL =
  process.env.PLAYWRIGHT_LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54341'

// Propagate to the test-runner process so e2e/helpers/db.ts can read it.
// (webServer.env only reaches the Next.js child process, not the test runner.)
process.env.PLAYWRIGHT_LOCAL_SUPABASE_URL = LOCAL_SUPABASE_URL

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Explicitly pass --hostname 0.0.0.0 so Next.js binds to both IPv4 and
    // IPv6 on macOS. Without this, Next.js 16 / Turbopack binds IPv6-only and
    // Playwright's health-check (which uses 127.0.0.1) can never succeed.
    command: `pnpm exec next dev --hostname 0.0.0.0 --port ${WEB_PORT}`,
    // Use 127.0.0.1 (not localhost) so Playwright's health-check uses IPv4.
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      // Force the Next.js server to use the local Supabase stack so that
      // session tokens minted by the E2E helpers are accepted by the server.
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      ASK2ACTION_MODE: 'fallback',
      // Expose the local Supabase URL to E2E helper code (Node.js process).
      PLAYWRIGHT_LOCAL_SUPABASE_URL: LOCAL_SUPABASE_URL,
    },
  },
})
