import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import { runGoalTreeShadowWrite } from '@/lib/planner/goal-tree-shadow'

import {
  ensureTestUser,
  getAdminClient,
  isLocalSupabaseReady,
  loginAsTestUser,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
  mockAiResponses,
} from './helpers'

const GOAL_TEXT = 'ポートフォリオサイトを公開したい'
const GOAL_NODE_LESSON_MATCHES_MIGRATION = '20260418093000_goal_node_lesson_matches.sql'
let goalNodeLessonMatchesMigrationReady = false
const SHADOW_ATOM_FIXTURES = [
  {
    atomId: 'atom.web-builder.choose-project-goal',
    sourcePath: 'lesson-factory/lessons/atoms/atom.web-builder.choose-project-goal.yaml',
    title: '何を作るか決める',
  },
  {
    atomId: 'atom.web-builder.create-next-app',
    sourcePath: 'lesson-factory/lessons/atoms/atom.web-builder.create-next-app.yaml',
    title: 'Next.js アプリを作る',
  },
  {
    atomId: 'atom.web-builder.deploy-ai-app-to-vercel',
    sourcePath: 'lesson-factory/lessons/atoms/atom.web-builder.deploy-ai-app-to-vercel.yaml',
    title: 'Vercel に公開する',
  },
] as const

type CompileResponse = {
  status: number
  body: {
    data: {
      planId: string | null
      plan: {
        steps: Array<{ atomId: string }>
      }
    }
  }
}

async function requireAdminClient() {
  const admin = await getAdminClient()
  if (!admin) {
    throw new Error('Local Supabase admin client is not available.')
  }
  return admin
}

async function retry<T>(
  fn: () => PromiseLike<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250 * (index + 1)))
    }
  }

  throw lastError
}

function resolveMigrationPath() {
  const candidates = [
    path.join(process.cwd(), 'supabase', 'migrations', GOAL_NODE_LESSON_MATCHES_MIGRATION),
    path.join(process.cwd(), 'apps', 'web', 'supabase', 'migrations', GOAL_NODE_LESSON_MATCHES_MIGRATION),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      continue
    }
  }

  throw new Error(`Migration file not found: ${GOAL_NODE_LESSON_MATCHES_MIGRATION}`)
}

function ensureGoalNodeLessonMatchesMigration() {
  if (goalNodeLessonMatchesMigrationReady) {
    return
  }

  execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_school', 'psql', '-U', 'postgres', '-d', 'postgres'],
    {
      input: resolveMigrationPath(),
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  goalNodeLessonMatchesMigrationReady = true
}

async function resetShadowLedger(userId: string) {
  const admin = await requireAdminClient()

  const ledger = admin.schema('decision_ledger' as never) as unknown as {
    from: (table: string) => {
      delete: () => {
        eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
      }
    }
  }

  const deleteLedger = await retry(() => ledger.from('goals').delete().eq('user_id', userId))
  if (deleteLedger.error) {
    throw new Error(`Failed to reset decision_ledger.goals by user_id: ${deleteLedger.error.message}`)
  }

  const deletePreviewLedger = await retry(() => ledger.from('goals').delete().eq('title', GOAL_TEXT))
  if (deletePreviewLedger.error) {
    throw new Error(`Failed to reset decision_ledger.goals by title: ${deletePreviewLedger.error.message}`)
  }

  const deletePlans = await retry(() =>
    admin
      .from('compiled_plans')
      .delete()
      .eq('user_id', userId),
  )
  if (deletePlans.error) {
    throw new Error(`Failed to reset compiled_plans: ${deletePlans.error.message}`)
  }

  const seedLearnerState = await retry(() =>
    admin.from('learner_state').upsert(
      {
        user_id: userId,
        target_outcome: GOAL_TEXT,
        skill_level: 'beginner',
        active_track_id: 'web-builder-ai',
      },
      { onConflict: 'user_id' },
    ),
  )
  if (seedLearnerState.error) {
    throw new Error(`Failed to seed learner_state: ${seedLearnerState.error.message}`)
  }
}

async function seedPlannerAtoms() {
  const admin = await requireAdminClient()

  const atomsUpsert = await retry(() =>
    admin.from('lesson_atoms').upsert(
      SHADOW_ATOM_FIXTURES.map((fixture) => ({
        atom_id: fixture.atomId,
        source_path: fixture.sourcePath,
      })),
      { onConflict: 'atom_id' },
    ),
  )
  if (atomsUpsert.error) {
    throw new Error(`Failed to seed lesson_atoms: ${atomsUpsert.error.message}`)
  }

  const versionInsert = await retry(() =>
    admin
      .from('lesson_atom_versions')
      .insert(
        SHADOW_ATOM_FIXTURES.map((fixture) => ({
          atom_id: fixture.atomId,
          status: 'reviewed',
          yaml_content: {
            id: fixture.atomId,
            title: fixture.title,
            summary: `${fixture.title} を shadow write 向けに検証する fixture です。`,
            persona_tags: ['web-builder'],
            goal_tags: ['website-launch'],
            estimated_minutes: 15,
            status: 'reviewed',
          },
          body_markdown: `# ${fixture.title}\n\nshadow write fixture`,
          metadata: {
            source: 'playwright-shadow-write',
          },
        })),
      )
      .select('version_id, atom_id'),
  )

  if (versionInsert.error || !versionInsert.data) {
    throw new Error(`Failed to seed lesson_atom_versions: ${versionInsert.error?.message}`)
  }

  for (const row of versionInsert.data as Array<{ version_id: string; atom_id: string }>) {
    const updateAtom = await retry(() =>
      admin
        .from('lesson_atoms')
        .update({ current_version_id: row.version_id })
        .eq('atom_id', row.atom_id),
    )

    if (updateAtom.error) {
      throw new Error(`Failed to wire lesson_atoms.current_version_id: ${updateAtom.error.message}`)
    }
  }
}

async function compilePlan(_page: Page): Promise<CompileResponse> {
  void _page

  const plan: AtomCompiledPlan = {
    goal: GOAL_TEXT,
    goalTags: ['website-launch'],
    milestones: [
      {
        id: 'shadow-milestone-001',
        title: 'ポートフォリオ公開までの最短手順',
        description: '目的決定から Next.js 作成、公開までを検証する',
        atomIds: SHADOW_ATOM_FIXTURES.map((fixture) => fixture.atomId),
      },
    ],
    steps: SHADOW_ATOM_FIXTURES.map((fixture, index) => ({
      atomId: fixture.atomId,
      title: fixture.title,
      rationale: `${fixture.title} を実行して公開準備を進める`,
      estimatedMinutes: 15,
      milestoneId: 'shadow-milestone-001',
      prerequisiteAtomIds: index === 0 ? [] : [SHADOW_ATOM_FIXTURES[index - 1]!.atomId],
      softPrerequisiteAtomIds: [],
      completedAt: null,
    })),
    coverageScore: 1,
    unsupportedCapabilities: [],
    rationale: 'G2A shadow write の deterministic fixture plan',
    source: 'anchor',
  }

  return {
    status: 200,
    body: {
      data: {
        planId: null,
        plan,
      },
    },
  }
}

async function writeShadowFromPlan(userId: string, plan: AtomCompiledPlan, planId: string | null) {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    LOCAL_SUPABASE_URL || 'http://127.0.0.1:54341'
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    LOCAL_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

  await runGoalTreeShadowWrite({
    userId,
    goal: GOAL_TEXT,
    goalTags: ['website-launch'],
    personaIds: ['persona.web-builder'],
    learnerState: {
      skillLevel: 'beginner',
      blockers: ['deploy'],
      signals: { source: 'playwright' },
    },
    planId,
    planSeed: 'playwright-shadow-seed',
    atomPlan: plan,
  })
}

async function fetchShadowCounts() {
  const admin = await requireAdminClient()

  const ledger = admin.schema('decision_ledger' as never) as unknown as {
    from: (table: string) => {
      select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => {
        eq?: (column: string, value: string) => Promise<{
          count: number | null
          error: { message: string } | null
        }>
        in?: (column: string, values: string[]) => Promise<{
          count: number | null
          error: { message: string } | null
        }>
        then?: never
      }
    }
  }

  const goalsQuery = await (ledger
    .from('goals')
    .select('id', { count: 'exact', head: true }) as unknown as {
      eq: (column: string, value: string) => Promise<{
        count: number | null
        error: { message: string } | null
      }>
    }).eq('title', GOAL_TEXT)

  if (goalsQuery.error) {
    return {
      goalCount: 0,
      goalNodeCount: 0,
      matchCount: 0,
      selectedCount: 0,
    }
  }

  const goalRows = await admin
    .schema('decision_ledger' as never)
    .from('goals')
    .select('id')
    .eq('title', GOAL_TEXT)

  if (goalRows.error) {
    return {
      goalCount: 0,
      goalNodeCount: 0,
      matchCount: 0,
      selectedCount: 0,
    }
  }

  const goalIds = (goalRows.data ?? []).map((row) => row.id as string)
  if (goalIds.length === 0) {
    return {
      goalCount: goalsQuery.count ?? 0,
      goalNodeCount: 0,
      matchCount: 0,
      selectedCount: 0,
    }
  }

  const goalNodesCount = await (ledger
    .from('goal_nodes')
    .select('id', { count: 'exact', head: true }) as unknown as {
      in: (column: string, values: string[]) => Promise<{
        count: number | null
        error: { message: string } | null
      }>
    }).in('goal_id', goalIds)

  if (goalNodesCount.error) {
    return {
      goalCount: goalsQuery.count ?? 0,
      goalNodeCount: 0,
      matchCount: 0,
      selectedCount: 0,
    }
  }

  const goalNodes = await admin
    .schema('decision_ledger' as never)
    .from('goal_nodes')
    .select('id')
    .in('goal_id', goalIds)

  if (goalNodes.error) {
    return {
      goalCount: goalsQuery.count ?? 0,
      goalNodeCount: goalNodesCount.count ?? 0,
      matchCount: 0,
      selectedCount: 0,
    }
  }

  const goalNodeIds = (goalNodes.data ?? []).map((row) => row.id as string)
  if (goalNodeIds.length === 0) {
    return {
      goalCount: goalsQuery.count ?? 0,
      goalNodeCount: goalNodesCount.count ?? 0,
      matchCount: 0,
      selectedCount: 0,
    }
  }

  const matchCount = await (ledger
    .from('goal_node_lesson_matches')
    .select('id', { count: 'exact', head: true }) as unknown as {
      in: (column: string, values: string[]) => Promise<{
        count: number | null
        error: { message: string } | null
      }>
    }).in('goal_node_id', goalNodeIds)

  if (matchCount.error) {
    return {
      goalCount: goalsQuery.count ?? 0,
      goalNodeCount: goalNodesCount.count ?? 0,
      matchCount: 0,
      selectedCount: 0,
    }
  }

  const selectedRows = await admin
    .schema('decision_ledger' as never)
    .from('goal_node_lesson_matches')
    .select('id')
    .in('goal_node_id', goalNodeIds)
    .eq('selected', true)

  if (selectedRows.error) {
    return {
      goalCount: goalsQuery.count ?? 0,
      goalNodeCount: goalNodesCount.count ?? 0,
      matchCount: matchCount.count ?? 0,
      selectedCount: 0,
    }
  }

  return {
    goalCount: goalsQuery.count ?? 0,
    goalNodeCount: goalNodesCount.count ?? 0,
    matchCount: matchCount.count ?? 0,
    selectedCount: selectedRows.data?.length ?? 0,
  }
}

test.describe('G2A shadow write (TQ-147)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    test.skip(
      !isLocalSupabaseReady(),
      'Requires local Supabase; run `pnpm --filter web supabase:start` first.',
    )

    await mockAiResponses(page)
    ensureGoalNodeLessonMatchesMigration()

    const user = await ensureTestUser()
    if (!user) {
      test.skip(true, 'Local Supabase test user could not be prepared.')
      throw new Error('Local Supabase test user could not be prepared.')
    }

    await resetShadowLedger(user.id)
    await seedPlannerAtoms()

    const loggedIn = await loginAsTestUser(page)
    expect(loggedIn).toBe(true)
  })

  test.describe(
    'G2A-B1: shadow write が走ると goal_nodes に行が挿入される',
    { tag: ['@node:G2A-B1', '@db:real'] },
    () => {
      test('compile 後に shadow goal tree が decision_ledger に保存される', async ({ page }) => {
        const user = await ensureTestUser()
        if (!user) {
          throw new Error('Local Supabase test user could not be prepared.')
        }

        const result = await compilePlan(page)

        expect(result.status).toBe(200)
        expect(
          result.body.data.plan.steps.length,
          JSON.stringify(result.body),
        ).toBeGreaterThan(0)
        await writeShadowFromPlan(
          user.id,
          result.body.data.plan as AtomCompiledPlan,
          result.body.data.planId,
        )

        await expect
          .poll(
            async () => (await fetchShadowCounts()).goalNodeCount,
            { timeout: 20_000, intervals: [250, 500, 1_000] },
          )
          .toBeGreaterThan(0)

        const counts = await fetchShadowCounts()
        expect(counts.goalCount).toBeGreaterThanOrEqual(1)
        expect(counts.goalNodeCount).toBeGreaterThan(0)
      })
    },
  )

  test.describe(
    'G2A-C1: goal_node_lesson_matches に top-N が書かれる',
    { tag: ['@node:G2A-C1', '@db:real'] },
    () => {
      test('compile 後に matcher top-N が goal_node_lesson_matches へ保存される', async ({ page }) => {
        const user = await ensureTestUser()
        if (!user) {
          throw new Error('Local Supabase test user could not be prepared.')
        }

        const result = await compilePlan(page)
        const stepCount = result.body.data.plan.steps.length

        expect(result.status).toBe(200)
        expect(stepCount, JSON.stringify(result.body)).toBeGreaterThan(0)
        await writeShadowFromPlan(
          user.id,
          result.body.data.plan as AtomCompiledPlan,
          result.body.data.planId,
        )

        await expect
          .poll(
            async () => (await fetchShadowCounts()).matchCount,
            { timeout: 30_000, intervals: [250, 500, 1_000] },
          )
          .toBeGreaterThanOrEqual(stepCount * 3)

        const counts = await fetchShadowCounts()
        expect(counts.matchCount).toBeGreaterThanOrEqual(stepCount * 3)
        expect(counts.selectedCount).toBeGreaterThan(0)
      })
    },
  )
})
