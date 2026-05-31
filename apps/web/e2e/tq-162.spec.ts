import { test, expect } from '@playwright/test'
import {
  ensureTestUser,
  getAdminClient,
  loginAsTestUser,
  resetTestUserData,
} from './helpers'

const CURRENT_ATOM_ID = 'atom.canonical.ai-tool-intro'
const NEXT_ATOM_ID = 'atom.canonical.ai-coding-basics'

async function resetCompiledPlans(userId: string) {
  const admin = await getAdminClient()
  if (!admin) {
    return false
  }

  const { error } = await admin
    .from('compiled_plans')
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to reset compiled_plans: ${error.message}`)
  }

  return true
}

async function seedCompiledPlan(userId: string) {
  const admin = await getAdminClient()
  if (!admin) {
    return false
  }

  const { error } = await admin.from('compiled_plans').insert({
    user_id: userId,
    goal: 'ポートフォリオサイトを公開したい',
    status: 'active',
    rationale: 'TQ-162 lesson complete flow seed',
    unsupported_capabilities: [],
    steps: [
      {
        atom_id: CURRENT_ATOM_ID,
        atom_title: 'AIツールの選び方入門',
        milestone_id: 'ms-tq-162-1',
        completed_at: null,
      },
      {
        atom_id: NEXT_ATOM_ID,
        atom_title: 'AIコーディングの基礎',
        milestone_id: 'ms-tq-162-1',
        completed_at: null,
      },
    ],
  })

  if (error) {
    throw new Error(`Failed to seed compiled_plans: ${error.message}`)
  }

  return true
}

test.describe(
  'TQ-162-01: Lesson complete hero next flow',
  { tag: ['@node:TQ-162-01', '@db:real'] },
  () => {
    test.describe.configure({ mode: 'serial' })

    test.beforeEach(async () => {
      const user = await ensureTestUser()
      if (!user) {
        return
      }

      await resetTestUserData(user.id)
      await resetCompiledPlans(user.id)
    })

    test('shows a hero CTA when the active plan has a next lesson', async ({ page }) => {
      const user = await ensureTestUser()
      if (!user) {
        test.skip(true, 'Requires local Supabase stack')
        return
      }

      await seedCompiledPlan(user.id)

      const loggedIn = await loginAsTestUser(page)
      if (!loggedIn) {
        test.skip(true, 'Requires SSR cookie auth (TQ-112)')
        return
      }

      await page.goto(`/lessons/${CURRENT_ATOM_ID}`)
      await expect(page.getByRole('button', { name: 'レッスン完了' })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'レッスン完了' }).click()

      const heroCta = page.locator('[data-next-flow-hero-cta="true"]')
      await expect(heroCta).toBeVisible()
      await expect(heroCta).toContainText('次のレッスンへ:')
      await expect(heroCta).toHaveAttribute('href', /\/lessons\//)
      await expect(page.locator('[data-next-flow-secondary-actions="true"]')).toContainText('完了レッスン一覧')
      await expect(page.locator('[data-next-flow-secondary-actions="true"]')).toContainText('プランに戻る')
    })

    test('falls back to the plan hero CTA when no next lesson exists', async ({ page }) => {
      const user = await ensureTestUser()
      if (!user) {
        test.skip(true, 'Requires local Supabase stack')
        return
      }

      const loggedIn = await loginAsTestUser(page)
      if (!loggedIn) {
        test.skip(true, 'Requires SSR cookie auth (TQ-112)')
        return
      }

      await page.goto(`/lessons/${CURRENT_ATOM_ID}`)
      await expect(page.getByRole('button', { name: 'レッスン完了' })).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'レッスン完了' }).click()

      const heroCta = page.locator('[data-next-flow-hero-cta="true"]')
      await expect(heroCta).toBeVisible()
      await expect(heroCta).toContainText('プランに戻る')
      await expect(heroCta).toHaveAttribute('href', '/plan')
    })
  },
)
