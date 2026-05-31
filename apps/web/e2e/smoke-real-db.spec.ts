import { test, expect } from '@playwright/test'
import {
  mockAiResponses,
  loginAsTestUser,
  mockSupabaseAuth,
  isLocalSupabaseReady,
  ensureTestUser,
} from './helpers/index'

/**
 * Proof-of-concept spec for the "real DB + mocked AI" pattern introduced in
 * the P3-4 refactor. See `apps/web/e2e/README.md` for the full design notes.
 *
 * Behaviour matrix:
 *   - Local Supabase reachable → logs in as the seeded test user, asserts
 *     that the planner landing page renders without hitting real AI APIs.
 *   - Local Supabase NOT reachable → falls back to `mockSupabaseAuth` so the
 *     spec still covers the same UI surface even in environments where the
 *     local stack isn't up (CI without `supabase start`, first-clone dev
 *     machines, etc.). This keeps the spec useful as a smoke test regardless
 *     of environment state.
 *
 * In both modes every AI endpoint is intercepted with deterministic fixtures
 * from `helpers/mock-ai.ts`. Real AI calls are never made.
 */

test.describe('Smoke: planner landing (real DB when available, mocked AI always)', () => {
  test.beforeEach(async ({ page }) => {
    // AI stays mocked regardless of DB availability — real AI calls are
    // expensive, slow and non-deterministic so they have no place in E2E.
    await mockAiResponses(page)

    // Prefer real auth + real Supabase. Fall back to full network-level mocks
    // if the local stack isn't reachable so the spec still runs in "smoke only"
    // mode on machines without `supabase start`.
    const user = await ensureTestUser()
    if (user) {
      await loginAsTestUser(page)
    } else {
      await mockSupabaseAuth(page)
    }
  })

  test('landing page renders with both entry CTAs', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText(
      'AI で実現したい人が、迷わず前進する mentor workspace',
    )
    await expect(page.getByRole('link', { name: 'Goal を共有する' }).first()).toHaveAttribute(
      'href',
      '/plan/onboarding',
    )
    await expect(page.getByRole('link', { name: '補助レッスンを見る' }).first()).toBeVisible()
  })

  test('planner page renders the goal input form', async ({ page }) => {
    // /plan redirects unauthenticated users to /plan/onboarding (wizard)
    await page.goto('/plan/onboarding')
    await expect(page.getByLabel('ゴール入力')).toBeVisible()
  })

  test(
    'returning-user workspace hydrates from seeded learner_state',
    async ({ page }) => {
      test.skip(
        !isLocalSupabaseReady(),
        'Requires local Supabase; run `pnpm --filter web supabase:start` first.',
      )

      // globalSetup already seeded a learner_state row for the test user.
      // Navigate to the planner — in real-DB mode the server should read that
      // row via RLS and render the returning-user experience.
      await page.goto('/plan')
      // Core marker: the page reached at least h1/textarea. Deeper assertions
      // on the workspace should be added once we migrate more specs.
      const heading = page.locator('h1, h2').first()
      await expect(heading).toBeVisible({ timeout: 10000 })
    },
  )
})
