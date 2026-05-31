import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Test DB helpers for Playwright E2E.
 *
 * These helpers assume a **local** Supabase instance is running (see
 * `apps/web/supabase/config.toml`). The migrations in that directory create all
 * required tables and `seed.sql` populates the deterministic track / module /
 * lesson catalog. On top of that baseline, this module lets individual specs
 * seed a known test user + plan row.
 *
 * If the local Supabase is NOT running, every helper in this file degrades to a
 * no-op and emits a single warning via `console.warn`. Specs that still want to
 * run without a real backend should rely on the `mockSupabaseAuth` helper from
 * `./auth.ts` instead — they simply won't exercise the DB layer.
 */

function resolveWorkerIndex() {
  const raw = process.env.TEST_WORKER_INDEX ?? '0'
  const parsed = Number.parseInt(raw, 10)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function scopeEmail(baseEmail: string) {
  const workerIndex = resolveWorkerIndex()
  if (workerIndex === 0) {
    return baseEmail
  }

  const atIndex = baseEmail.indexOf('@')
  if (atIndex < 0) {
    return `${baseEmail}+w${workerIndex}`
  }

  return `${baseEmail.slice(0, atIndex)}+w${workerIndex}${baseEmail.slice(atIndex)}`
}

function formatUuid(compact: string) {
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
}

function scopeUuid(baseUuid: string, offset = 0) {
  const compact = baseUuid.replace(/-/g, '')
  const scope = ((resolveWorkerIndex() + offset) & 0xff).toString(16).padStart(2, '0')
  const scoped = `${compact.slice(0, -4)}${scope}${compact.slice(-2)}`

  return formatUuid(scoped)
}

function scopeUuidList<const TIds extends readonly string[]>(ids: TIds): TIds {
  return ids.map((id, index) => scopeUuid(id, index)) as unknown as TIds
}

export const TEST_USER_EMAIL = scopeEmail('e2e-test@school.local')
export const TEST_USER_PASSWORD = 'e2e-test-password-!@#'
// Deterministic UUID so FK references in seeded rows are stable across runs.
export const TEST_USER_ID = scopeUuid('00000000-0000-4000-8000-00000000e2e0')
export const TEST_OWNER_EMAIL = scopeEmail('e2e-owner@school.local')
export const TEST_OWNER_PASSWORD = 'e2e-owner-password-!@#'
export const GOAL_TREE_FIXTURE_GOAL_ID = scopeUuid('15915915-9159-4159-8159-159159159159')
export const GOAL_TREE_FIXTURE_LESSON_ID = 'atom.goal-tree.fixture'
export const GOAL_TREE_FIXTURE_NODE_IDS = scopeUuidList([
  '15915915-9159-4159-8159-159159159101',
  '15915915-9159-4159-8159-159159159102',
  '15915915-9159-4159-8159-159159159103',
  '15915915-9159-4159-8159-159159159104',
  '15915915-9159-4159-8159-159159159105',
  '15915915-9159-4159-8159-159159159106',
])
export const GOAL_TREE_FIXTURE_MATCH_IDS = scopeUuidList([
  '15915915-9159-4159-8159-159159159199',
])

const GOAL_CONTEXT_FIXTURE_GOAL_ID = scopeUuid('16716716-7167-4167-8167-167167167167')
const GOAL_CONTEXT_FIXTURE_NODE_IDS = scopeUuidList([
  '16716716-7167-4167-8167-167167167101',
  '16716716-7167-4167-8167-167167167102',
  '16716716-7167-4167-8167-167167167103',
])
const GOAL_CONTEXT_FIXTURE_CONTEXT_IDS = scopeUuidList([
  '16716716-7167-4167-8167-167167167201',
])
const GOAL_CONTEXT_FIXTURE_MEMORY_IDS = scopeUuidList([
  '16716716-7167-4167-8167-167167167301',
  '16716716-7167-4167-8167-167167167302',
])
const GOAL_CONTEXT_FIXTURE_ARTIFACT_IDS = scopeUuidList([
  '16716716-7167-4167-8167-167167167401',
])
const GOAL_CONTEXT_FIXTURE_AGENT_RUN_IDS = scopeUuidList([
  '16716716-7167-4167-8167-167167167701',
])
const ASK2ACTION_FIXTURE_PUBLIC_GOAL_ID = scopeUuid('17017017-0170-4017-8017-170170170170')
const ASK2ACTION_FIXTURE_LEDGER_GOAL_ID = scopeUuid('17017017-0170-4017-8017-170170170171')
const ASK2ACTION_FIXTURE_PLAN_ID = scopeUuid('17017017-0170-4017-8017-170170170401')
const ASK2ACTION_FIXTURE_NODE_IDS = scopeUuidList([
  '17017017-0170-4017-8017-170170170201',
  '17017017-0170-4017-8017-170170170202',
  '17017017-0170-4017-8017-170170170203',
])
const ASK2ACTION_FIXTURE_MEMORY_IDS = scopeUuidList([
  '17017017-0170-4017-8017-170170170301',
])
const ASK2ACTION_FIXTURE_GOAL_TEXT = 'ポートフォリオサイトを公開する'
const GOAL_CONTEXT_FIXTURE_PLAN_ID = scopeUuid('16716716-7167-4167-8167-167167167801')
const GOAL_CONTEXT_FIXTURE_TASK_PROGRESS_ID = scopeUuid('16716716-7167-4167-8167-167167167901')
const GOAL_CONTEXT_FIXTURE_TELEMETRY_EVENT_ID = scopeUuid('16716716-7167-4167-8167-167167167902')
const GOAL_CONTEXT_FIXTURE_LESSON_ID = 'atom.canonical.ai-tool-intro'
type GoalContextFixtureNamespace =
  | 'default'
  | 'goal-context'
  | 'tq-169'
  | 'tq-172'
  | 'tq-173'

const GOAL_CONTEXT_FIXTURE_ID_SETS: Record<
  GoalContextFixtureNamespace,
  {
    goalId: string
    nodeIds: readonly [string, string, string]
    contextIds: readonly [string]
    memoryIds: readonly [string, string]
    artifactIds: readonly [string]
    agentRunIds: readonly [string]
    planId: string
    taskProgressId: string
    telemetryEventId: string
  }
> = {
  default: {
    goalId: GOAL_CONTEXT_FIXTURE_GOAL_ID,
    nodeIds: GOAL_CONTEXT_FIXTURE_NODE_IDS,
    contextIds: GOAL_CONTEXT_FIXTURE_CONTEXT_IDS,
    memoryIds: GOAL_CONTEXT_FIXTURE_MEMORY_IDS,
    artifactIds: GOAL_CONTEXT_FIXTURE_ARTIFACT_IDS,
    agentRunIds: GOAL_CONTEXT_FIXTURE_AGENT_RUN_IDS,
    planId: GOAL_CONTEXT_FIXTURE_PLAN_ID,
    taskProgressId: GOAL_CONTEXT_FIXTURE_TASK_PROGRESS_ID,
    telemetryEventId: GOAL_CONTEXT_FIXTURE_TELEMETRY_EVENT_ID,
  },
  'goal-context': {
    goalId: '16716716-7167-4167-8167-167167167267',
    nodeIds: [
      '16716716-7167-4167-8167-167167167268',
      '16716716-7167-4167-8167-167167167269',
      '16716716-7167-4167-8167-16716716726a',
    ],
    contextIds: ['16716716-7167-4167-8167-16716716726b'],
    memoryIds: [
      '16716716-7167-4167-8167-16716716726c',
      '16716716-7167-4167-8167-16716716726d',
    ],
    artifactIds: ['16716716-7167-4167-8167-16716716726e'],
    agentRunIds: ['16716716-7167-4167-8167-16716716726f'],
    planId: '16716716-7167-4167-8167-167167167270',
    taskProgressId: '16716716-7167-4167-8167-167167167271',
    telemetryEventId: '16716716-7167-4167-8167-167167167272',
  },
  'tq-169': {
    goalId: '16916916-9169-4169-8169-169169169169',
    nodeIds: [
      '16916916-9169-4169-8169-169169169101',
      '16916916-9169-4169-8169-169169169102',
      '16916916-9169-4169-8169-169169169103',
    ],
    contextIds: ['16916916-9169-4169-8169-169169169201'],
    memoryIds: [
      '16916916-9169-4169-8169-169169169301',
      '16916916-9169-4169-8169-169169169302',
    ],
    artifactIds: ['16916916-9169-4169-8169-169169169401'],
    agentRunIds: ['16916916-9169-4169-8169-169169169701'],
    planId: '16916916-9169-4169-8169-169169169801',
    taskProgressId: '16916916-9169-4169-8169-169169169901',
    telemetryEventId: '16916916-9169-4169-8169-169169169902',
  },
  'tq-172': {
    goalId: '17217217-2172-4172-8172-172172172172',
    nodeIds: [
      '17217217-2172-4172-8172-172172172101',
      '17217217-2172-4172-8172-172172172102',
      '17217217-2172-4172-8172-172172172103',
    ],
    contextIds: ['17217217-2172-4172-8172-172172172201'],
    memoryIds: [
      '17217217-2172-4172-8172-172172172301',
      '17217217-2172-4172-8172-172172172302',
    ],
    artifactIds: ['17217217-2172-4172-8172-172172172401'],
    agentRunIds: ['17217217-2172-4172-8172-172172172701'],
    planId: '17217217-2172-4172-8172-172172172801',
    taskProgressId: '17217217-2172-4172-8172-172172172901',
    telemetryEventId: '17217217-2172-4172-8172-172172172902',
  },
  'tq-173': {
    goalId: '17317317-3173-4173-8173-173173173173',
    nodeIds: [
      '17317317-3173-4173-8173-173173173101',
      '17317317-3173-4173-8173-173173173102',
      '17317317-3173-4173-8173-173173173103',
    ],
    contextIds: ['17317317-3173-4173-8173-173173173201'],
    memoryIds: [
      '17317317-3173-4173-8173-173173173301',
      '17317317-3173-4173-8173-173173173302',
    ],
    artifactIds: ['17317317-3173-4173-8173-173173173401'],
    agentRunIds: ['17317317-3173-4173-8173-173173173701'],
    planId: '17317317-3173-4173-8173-173173173801',
    taskProgressId: '17317317-3173-4173-8173-173173173901',
    telemetryEventId: '17317317-3173-4173-8173-173173173902',
  },
}

const GOAL_TREE_FIXTURE_NODES = [
  {
    id: GOAL_TREE_FIXTURE_NODE_IDS[0],
    goal_id: GOAL_TREE_FIXTURE_GOAL_ID,
    parent_node_id: null,
    label: '公開する理由と完成像を固める',
    node_type: 'objective',
    status: 'in_progress',
    sort_order: 0,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: { source: 'playwright-goal-tree' },
  },
  {
    id: GOAL_TREE_FIXTURE_NODE_IDS[1],
    goal_id: GOAL_TREE_FIXTURE_GOAL_ID,
    parent_node_id: GOAL_TREE_FIXTURE_NODE_IDS[0],
    label: '導線を決める',
    node_type: 'milestone',
    status: 'in_progress',
    sort_order: 1,
    owner_type: 'both',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: { source: 'playwright-goal-tree' },
  },
  {
    id: GOAL_TREE_FIXTURE_NODE_IDS[2],
    goal_id: GOAL_TREE_FIXTURE_GOAL_ID,
    parent_node_id: GOAL_TREE_FIXTURE_NODE_IDS[0],
    label: '公開準備を終える',
    node_type: 'milestone',
    status: 'pending',
    sort_order: 2,
    owner_type: 'external',
    depends_on_node_ids: [GOAL_TREE_FIXTURE_NODE_IDS[1]],
    fallback_node_id: null,
    metadata: { source: 'playwright-goal-tree' },
  },
  {
    id: GOAL_TREE_FIXTURE_NODE_IDS[3],
    goal_id: GOAL_TREE_FIXTURE_GOAL_ID,
    parent_node_id: GOAL_TREE_FIXTURE_NODE_IDS[1],
    label: 'トップページの情報設計を決める',
    node_type: 'task',
    status: 'done',
    sort_order: 3,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: { source: 'playwright-goal-tree' },
  },
  {
    id: GOAL_TREE_FIXTURE_NODE_IDS[4],
    goal_id: GOAL_TREE_FIXTURE_GOAL_ID,
    parent_node_id: GOAL_TREE_FIXTURE_NODE_IDS[1],
    label: 'プロフィールと制作実績を載せる',
    node_type: 'task',
    status: 'in_progress',
    sort_order: 4,
    owner_type: 'both',
    depends_on_node_ids: [GOAL_TREE_FIXTURE_NODE_IDS[3]],
    fallback_node_id: GOAL_TREE_FIXTURE_NODE_IDS[5],
    metadata: { source: 'playwright-goal-tree' },
  },
  {
    id: GOAL_TREE_FIXTURE_NODE_IDS[5],
    goal_id: GOAL_TREE_FIXTURE_GOAL_ID,
    parent_node_id: GOAL_TREE_FIXTURE_NODE_IDS[2],
    label: '公開 URL を確認する',
    node_type: 'task',
    status: 'pending',
    sort_order: 5,
    owner_type: 'ai',
    depends_on_node_ids: [GOAL_TREE_FIXTURE_NODE_IDS[4]],
    fallback_node_id: null,
    metadata: { source: 'playwright-goal-tree' },
  },
] as const

const GOAL_TREE_FIXTURE_MATCHES = [
  {
    id: GOAL_TREE_FIXTURE_MATCH_IDS[0],
    goal_node_id: GOAL_TREE_FIXTURE_NODE_IDS[4],
    lesson_id: GOAL_TREE_FIXTURE_LESSON_ID,
    score: 0.82,
    rationale: 'goal-tree fixture match',
    selected: true,
  },
] as const

const GOAL_CONTEXT_FIXTURE_TITLE = 'Goal Context Panel を整える'
const GOAL_CONTEXT_FIXTURE_NODES = [
  {
    id: GOAL_CONTEXT_FIXTURE_NODE_IDS[0],
    goal_id: GOAL_CONTEXT_FIXTURE_GOAL_ID,
    parent_node_id: null,
    label: '完成形を決める',
    node_type: 'objective',
    status: 'in_progress',
    sort_order: 0,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: { source: 'playwright-goal-context' },
  },
  {
    id: GOAL_CONTEXT_FIXTURE_NODE_IDS[1],
    goal_id: GOAL_CONTEXT_FIXTURE_GOAL_ID,
    parent_node_id: GOAL_CONTEXT_FIXTURE_NODE_IDS[0],
    label: 'UI セクションを揃える',
    node_type: 'task',
    status: 'done',
    sort_order: 1,
    owner_type: 'both',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: { source: 'playwright-goal-context' },
  },
  {
    id: GOAL_CONTEXT_FIXTURE_NODE_IDS[2],
    goal_id: GOAL_CONTEXT_FIXTURE_GOAL_ID,
    parent_node_id: GOAL_CONTEXT_FIXTURE_NODE_IDS[0],
    label: 'E2E を green にする',
    node_type: 'task',
    status: 'pending',
    sort_order: 2,
    owner_type: 'ai',
    depends_on_node_ids: [GOAL_CONTEXT_FIXTURE_NODE_IDS[1]],
    fallback_node_id: null,
    metadata: { source: 'playwright-goal-context' },
  },
] as const

const GOAL_CONTEXT_FIXTURE_GOAL_CONTEXTS = [
  {
    id: GOAL_CONTEXT_FIXTURE_CONTEXT_IDS[0],
    goal_id: GOAL_CONTEXT_FIXTURE_GOAL_ID,
    node_id: GOAL_CONTEXT_FIXTURE_NODE_IDS[2],
    source_type: 'doc',
    source_uri: 'https://example.com/tq-167',
    content: 'Goal Context Panel は hero と accordion を持つ',
    freshness_at: null,
    metadata: { source: 'playwright-goal-context' },
  },
] as const

const GOAL_CONTEXT_FIXTURE_MEMORIES = [
  {
    id: GOAL_CONTEXT_FIXTURE_MEMORY_IDS[0],
    user_id: TEST_USER_ID,
    track_id: null,
    task_id: null,
    title: 'hero は above-the-fold に出す',
    bullets: ['next_action を最上部で読めるようにする'],
    source: 'mentor',
  },
  {
    id: GOAL_CONTEXT_FIXTURE_MEMORY_IDS[1],
    user_id: TEST_USER_ID,
    track_id: null,
    task_id: null,
    title: 'accordion は default close',
    bullets: ['memory/context/artifacts を折りたたむ'],
    source: 'mentor',
  },
] as const

const GOAL_CONTEXT_FIXTURE_ARTIFACTS = [
  {
    id: GOAL_CONTEXT_FIXTURE_ARTIFACT_IDS[0],
    user_id: TEST_USER_ID,
    planner_goal: GOAL_CONTEXT_FIXTURE_TITLE,
    track_id: null,
    milestone_id: '16716716-7167-4167-8167-167167167501',
    milestone_title: 'UI polish',
    step_id: GOAL_CONTEXT_FIXTURE_NODE_IDS[1],
    step_title: 'accordion 実装',
    artifact_type: 'url',
    title: 'storybook preview',
    content: 'https://example.com/goal-context',
  },
] as const

const GOAL_CONTEXT_FIXTURE_AGENT_RUNS = [
  {
    id: GOAL_CONTEXT_FIXTURE_AGENT_RUN_IDS[0],
    goal_id: GOAL_CONTEXT_FIXTURE_GOAL_ID,
    action_id: null,
    agent_type: 'other',
    run_status: 'success',
    input_summary: 'goal context fixture',
    output_summary: null,
    error_message: null,
    metadata: {
      next_action: 'accordion を開いて内容を確認する',
      decisions: ['hero を先に出す', 'sections は default close にする'],
    },
    artifacts: {},
  },
] as const

const ASK2ACTION_FIXTURE_NODES = [
  {
    id: ASK2ACTION_FIXTURE_NODE_IDS[0],
    goal_id: ASK2ACTION_FIXTURE_LEDGER_GOAL_ID,
    parent_node_id: null,
    label: '公開する完成形を決める',
    node_type: 'objective',
    status: 'in_progress',
    sort_order: 0,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: { source: 'playwright-ask2action' },
  },
  {
    id: ASK2ACTION_FIXTURE_NODE_IDS[1],
    goal_id: ASK2ACTION_FIXTURE_LEDGER_GOAL_ID,
    parent_node_id: ASK2ACTION_FIXTURE_NODE_IDS[0],
    label: 'ヒーローの方向性を決める',
    node_type: 'task',
    status: 'in_progress',
    sort_order: 1,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: { source: 'playwright-ask2action' },
  },
  {
    id: ASK2ACTION_FIXTURE_NODE_IDS[2],
    goal_id: ASK2ACTION_FIXTURE_LEDGER_GOAL_ID,
    parent_node_id: ASK2ACTION_FIXTURE_NODE_IDS[0],
    label: '公開導線を整える',
    node_type: 'task',
    status: 'pending',
    sort_order: 2,
    owner_type: 'both',
    depends_on_node_ids: [ASK2ACTION_FIXTURE_NODE_IDS[1]],
    fallback_node_id: null,
    metadata: { source: 'playwright-ask2action' },
  },
] as const

const ASK2ACTION_FIXTURE_MEMORIES = [
  {
    id: ASK2ACTION_FIXTURE_MEMORY_IDS[0],
    user_id: TEST_USER_ID,
    track_id: null,
    task_id: null,
    title: '最初は hero copy を先に決める',
    bullets: ['ファーストビューの訴求を固めてから詳細に入る'],
    source: 'mentor',
  },
] as const

const GOAL_CONTEXT_FIXTURE_COMPILED_PLAN = {
  plan_id: GOAL_CONTEXT_FIXTURE_PLAN_ID,
  user_id: TEST_USER_ID,
  goal: GOAL_CONTEXT_FIXTURE_TITLE,
  rationale: 'goal context timeline fixture',
  status: 'active',
  steps: [],
  unsupported_capabilities: [],
} as const

const GOAL_CONTEXT_FIXTURE_TASK_PROGRESS = {
  id: GOAL_CONTEXT_FIXTURE_TASK_PROGRESS_ID,
  plan_id: GOAL_CONTEXT_FIXTURE_PLAN_ID,
  task_id: GOAL_CONTEXT_FIXTURE_NODE_IDS[1],
  status: 'completed',
  title: 'Progress Timeline section を追加する',
  do_text: 'details open で追加する',
  learn_text: '時系列で確認できるようにする',
  why_text: 'goal の前進を見える化する',
  relevant_lesson_ids: [GOAL_CONTEXT_FIXTURE_LESSON_ID],
  started_at: '2026-04-18T09:20:00.000Z',
  completed_at: '2026-04-18T09:40:00.000Z',
  elapsed_minutes: 20,
  updated_at: '2026-04-18T09:40:00.000Z',
} as const

const GOAL_CONTEXT_FIXTURE_TELEMETRY_EVENT = {
  event_id: GOAL_CONTEXT_FIXTURE_TELEMETRY_EVENT_ID,
  user_id: TEST_USER_ID,
  event_name: 'lesson_completed',
  atom_id: GOAL_CONTEXT_FIXTURE_LESSON_ID,
  atom_version_id: null,
  plan_id: GOAL_CONTEXT_FIXTURE_PLAN_ID,
  request_id: null,
  source: 'server',
  properties: {
    source: 'lesson_complete',
  },
  occurred_at: '2026-04-18T10:00:00.000Z',
} as const

function buildGoalContextFixture(
  namespace: GoalContextFixtureNamespace,
) {
  const ids = GOAL_CONTEXT_FIXTURE_ID_SETS[namespace]
  const nodeIdMap = new Map<string, string>(
    GOAL_CONTEXT_FIXTURE_NODE_IDS.map((id, index) => [id, ids.nodeIds[index]] as const),
  )

  const remapNodeId = (value: string | null) => (value ? (nodeIdMap.get(value) ?? value) : null)

  return {
    goalId: ids.goalId,
    nodes: GOAL_CONTEXT_FIXTURE_NODES.map((node) => ({
      ...node,
      id: nodeIdMap.get(node.id) ?? node.id,
      goal_id: ids.goalId,
      parent_node_id: remapNodeId(node.parent_node_id),
      depends_on_node_ids: node.depends_on_node_ids.map((id) => nodeIdMap.get(id) ?? id),
      fallback_node_id: remapNodeId(node.fallback_node_id),
    })),
    goalContexts: GOAL_CONTEXT_FIXTURE_GOAL_CONTEXTS.map((context, index) => ({
      ...context,
      id: ids.contextIds[index],
      goal_id: ids.goalId,
      node_id: remapNodeId(context.node_id),
    })),
    memories: GOAL_CONTEXT_FIXTURE_MEMORIES.map((memory, index) => ({
      ...memory,
      id: ids.memoryIds[index],
    })),
    artifacts: GOAL_CONTEXT_FIXTURE_ARTIFACTS.map((artifact, index) => ({
      ...artifact,
      id: ids.artifactIds[index],
      step_id: remapNodeId(artifact.step_id) ?? artifact.step_id,
    })),
    agentRuns: GOAL_CONTEXT_FIXTURE_AGENT_RUNS.map((run, index) => ({
      ...run,
      id: ids.agentRunIds[index],
      goal_id: ids.goalId,
    })),
    compiledPlan: {
      ...GOAL_CONTEXT_FIXTURE_COMPILED_PLAN,
      plan_id: ids.planId,
    },
    taskProgress: {
      ...GOAL_CONTEXT_FIXTURE_TASK_PROGRESS,
      id: ids.taskProgressId,
      plan_id: ids.planId,
      task_id: ids.nodeIds[1],
    },
    telemetryEvent: {
      ...GOAL_CONTEXT_FIXTURE_TELEMETRY_EVENT,
      event_id: ids.telemetryEventId,
      plan_id: ids.planId,
    },
    planId: ids.planId,
  }
}

/**
 * The local Supabase URL used by E2E helper code (Node.js test-runner process,
 * NOT the browser-side client).
 *
 * Precedence (highest → lowest):
 *  1. PLAYWRIGHT_LOCAL_SUPABASE_URL — explicit override for the local stack URL
 *  2. http://localhost:54341        — default port from supabase/config.toml
 *
 * Intentionally does NOT fall back to NEXT_PUBLIC_SUPABASE_URL: that env var
 * normally holds the production URL (from .env.local) and is unrelated to the
 * throw-away local DB stack the E2E helpers operate against.
 */
export const LOCAL_SUPABASE_URL =
  process.env.PLAYWRIGHT_LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54341'

/** @deprecated Use LOCAL_SUPABASE_URL — kept for backward-compat within this file */
const SUPABASE_URL = LOCAL_SUPABASE_URL

/**
 * Default local service role key shipped with `supabase start` — safe to
 * commit because it only grants admin access to the throw-away local DB.
 * Override with SUPABASE_SERVICE_ROLE_KEY in the environment if you are
 * running a non-default local stack.
 */
export const LOCAL_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let cachedAdminClient: SupabaseClient | null = null
let localStackAvailable: boolean | null = null
const LOCAL_SUPABASE_READY_ENV = 'PLAYWRIGHT_LOCAL_SUPABASE_READY'
const LOCAL_SUPABASE_PROBE_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]

type E2EQueryError = {
  message: string
  code?: string | null
  details?: string | null
  hint?: string | null
}

type E2EMutationResult = PromiseLike<{
  error: E2EQueryError | null
}>

type SeedFixtureContext = {
  admin: SupabaseClient
  uid: string
}

type SeedFixtureReset = (userId: string) => Promise<void>

const IDEMPOTENT_SEED_ERROR_CODES = new Set(['23505'])

type E2EListResult<TRow> = Promise<{
  data: TRow[] | null
  error: E2EQueryError | null
}>

type E2ESingleResult<TRow> = Promise<{
  data: TRow | null
  error: E2EQueryError | null
}>

export type E2EQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => E2EQueryBuilder<TRow>
  insert: (...args: unknown[]) => E2EQueryBuilder<TRow>
  upsert: (...args: unknown[]) => E2EQueryBuilder<TRow>
  update: (...args: unknown[]) => E2EQueryBuilder<TRow>
  delete: () => E2EQueryBuilder<TRow>
  eq: (...args: unknown[]) => E2EQueryBuilder<TRow>
  in: (...args: unknown[]) => E2EQueryBuilder<TRow>
  is: (...args: unknown[]) => E2EQueryBuilder<TRow>
  order: (...args: unknown[]) => E2EQueryBuilder<TRow>
  limit: (...args: unknown[]) => E2EQueryBuilder<TRow>
  maybeSingle: () => E2ESingleResult<TRow>
  single: () => E2ESingleResult<TRow>
  then: PromiseLike<{
    data: TRow[] | null
    error: E2EQueryError | null
  }>['then']
}

export type E2EDecisionLedgerClient = {
  from: <TRow = Record<string, unknown>>(table: string) => E2EQueryBuilder<TRow>
}

export function getDecisionLedgerClient(
  client: SupabaseClient,
): E2EDecisionLedgerClient {
  return client.schema('decision_ledger' as never) as unknown as E2EDecisionLedgerClient
}

function setLocalStackAvailable(ready: boolean) {
  localStackAvailable = ready
  process.env[LOCAL_SUPABASE_READY_ENV] = ready ? 'true' : 'false'
}

function isMissingRelationError(message: string) {
  return /relation.*does not exist/i.test(message)
}

function getE2EQueryErrorMessage(error: E2EQueryError) {
  return [error.message, error.details, error.hint].filter(Boolean).join(' ').trim()
}

function isIdempotentSeedFixtureError(error: E2EQueryError | null | undefined) {
  return typeof error?.code === 'string' && IDEMPOTENT_SEED_ERROR_CODES.has(error.code)
}

export function assertSeedFixtureStepSucceeded(
  fixtureName: string,
  step: string,
  error: E2EQueryError | null | undefined,
) {
  if (!error || isIdempotentSeedFixtureError(error)) {
    return
  }

  const code = typeof error.code === 'string' && error.code.length > 0 ? ` (${error.code})` : ''
  const message = getE2EQueryErrorMessage(error) || 'unknown database error'
  throw new Error(`[e2e/db] ${fixtureName} ${step} failed${code}: ${message}`)
}

async function runSeedFixtureStep(
  fixtureName: string,
  step: string,
  mutation: E2EMutationResult,
) {
  const { error } = await mutation
  assertSeedFixtureStepSucceeded(fixtureName, step, error)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForAdminProbe(client: SupabaseClient) {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= LOCAL_SUPABASE_PROBE_RETRY_DELAYS_MS.length; attempt += 1) {
    const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (!error) {
      return
    }

    lastError = error
    const delay = LOCAL_SUPABASE_PROBE_RETRY_DELAYS_MS[attempt]
    if (typeof delay !== 'number') {
      break
    }

    console.warn(
      `[e2e/db] admin probe failed (${error.message}); retrying in ${delay}ms ` +
        `(attempt ${attempt + 1}/${LOCAL_SUPABASE_PROBE_RETRY_DELAYS_MS.length + 1})`,
    )
    await sleep(delay)
  }

  throw lastError ?? new Error('unknown Supabase admin probe failure')
}

async function waitForSchemaCacheWarm(client: SupabaseClient) {
  let lastError: Error | null = null
  const ledger = getDecisionLedgerClient(client)

  for (let attempt = 0; attempt <= LOCAL_SUPABASE_PROBE_RETRY_DELAYS_MS.length; attempt += 1) {
    const [
      publicResult,
      ledgerResult,
    ] = await Promise.all([
      client.from('compiled_plans').select('plan_id').limit(1),
      ledger.from('goals').select('id').limit(1),
    ])

    if (!publicResult.error && !ledgerResult.error) {
      return
    }

    lastError = new Error(
      publicResult.error?.message
      ?? ledgerResult.error?.message
      ?? 'schema cache not ready',
    )

    const delay = LOCAL_SUPABASE_PROBE_RETRY_DELAYS_MS[attempt]
    if (typeof delay !== 'number') {
      break
    }

    console.warn(
      `[e2e/db] schema cache not ready (${lastError.message}); retrying in ${delay}ms ` +
        `(attempt ${attempt + 1}/${LOCAL_SUPABASE_PROBE_RETRY_DELAYS_MS.length + 1})`,
    )
    await sleep(delay)
  }

  throw lastError ?? new Error('unknown Supabase schema cache warmup failure')
}

/**
 * Returns an admin Supabase client pointed at the local stack, or `null` if
 * the local stack is not reachable. The reachability probe happens once and
 * is cached for the lifetime of the process.
 */
export async function getAdminClient(): Promise<SupabaseClient | null> {
  if (localStackAvailable === false) return null
  if (cachedAdminClient) return cachedAdminClient

  const client = createClient(SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // Cheap reachability probe — call the auth admin endpoint.
    // After `supabase db reset` the auth admin API can lag the REST ping for a
    // few seconds while schema caches warm up, so retry before declaring the
    // stack unavailable.
    await waitForAdminProbe(client)
    await waitForSchemaCacheWarm(client)
    cachedAdminClient = client
    setLocalStackAvailable(true)
    return client
  } catch (error) {
    setLocalStackAvailable(false)
    console.warn(
      `[e2e/db] Local Supabase at ${SUPABASE_URL} is not reachable — DB helpers will no-op. ` +
        'Run `pnpm --filter web supabase:start` (or equivalent) to enable real-DB specs. ' +
        `Underlying error: ${(error as Error).message}`,
    )
    return null
  }
}

/**
 * Ensure the deterministic E2E test user exists in auth.users.
 * Idempotent — subsequent calls are cheap no-ops.
 */
export async function ensureTestUser(): Promise<{ id: string; email: string } | null> {
  const admin = await getAdminClient()
  if (!admin) return null

  return ensureAuthUser({
    admin,
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    userMetadata: { source: 'playwright-e2e' },
  })
}

export async function ensureOwnerUser(): Promise<{ id: string; email: string } | null> {
  const admin = await getAdminClient()
  if (!admin) return null

  return ensureAuthUser({
    admin,
    email: TEST_OWNER_EMAIL,
    password: TEST_OWNER_PASSWORD,
    userMetadata: {
      source: 'playwright-e2e',
      role: 'owner',
    },
    appMetadata: {
      role: 'owner',
    },
  })
}

async function ensureAuthUser(params: {
  admin: SupabaseClient
  email: string
  password: string
  userMetadata: Record<string, unknown>
  appMetadata?: Record<string, unknown>
}): Promise<{ id: string; email: string } | null> {
  const { data: existing, error: listError } = await params.admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (listError) {
    console.warn('[e2e/db] listUsers failed:', listError.message)
    return null
  }

  const match = existing.users.find((u: { email?: string | null }) => u.email === params.email)
  if (match) {
    const role = match.user_metadata?.role
    const appRole = match.app_metadata?.role
    const needsUserMetadataUpdate =
      params.userMetadata.role && role !== params.userMetadata.role
    const needsAppMetadataUpdate =
      params.appMetadata?.role && appRole !== params.appMetadata.role

    if (needsUserMetadataUpdate || needsAppMetadataUpdate) {
      const { error: updateError } = await params.admin.auth.admin.updateUserById(match.id, {
        ...(needsUserMetadataUpdate
          ? {
              user_metadata: {
                ...(match.user_metadata ?? {}),
                ...params.userMetadata,
              },
            }
          : {}),
        ...(needsAppMetadataUpdate
          ? {
              app_metadata: {
                ...(match.app_metadata ?? {}),
                ...params.appMetadata,
              },
            }
          : {}),
      })
      if (updateError) {
        console.warn('[e2e/db] updateUserById failed:', updateError.message)
        return null
      }
    }

    return { id: match.id, email: params.email }
  }

  const { data: created, error: createError } =
    await params.admin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
      user_metadata: params.userMetadata,
      app_metadata: params.appMetadata,
    })
  if (createError || !created.user) {
    const { data: retryList, error: retryListError } =
      await params.admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      })

    if (!retryListError) {
      const retryMatch = retryList.users.find(
        (u: { email?: string | null }) => u.email === params.email,
      )
      if (retryMatch) {
        return { id: retryMatch.id, email: params.email }
      }
    }

    console.warn('[e2e/db] createUser failed:', createError?.message)
    return null
  }
  return { id: created.user.id, email: params.email }
}

/**
 * Reset E2E-owned rows for the test user so specs get a clean slate.
 * Only touches rows that belong to the test user — never truncates shared
 * catalog tables (modules, lessons, tracks).
 */
export async function resetTestUserData(userId?: string): Promise<void> {
  const admin = await getAdminClient()
  if (!admin) return

  const uid = userId ?? (await ensureTestUser())?.id
  if (!uid) return

  const { data: compiledPlans, error: compiledPlansError } = await admin
    .from('compiled_plans')
    .select('plan_id')
    .eq('user_id', uid)

  if (compiledPlansError && !isMissingRelationError(compiledPlansError.message)) {
    console.warn('[e2e/db] reset compiled_plans lookup failed:', compiledPlansError.message)
  }

  const planIds = (compiledPlans ?? []).map((plan) => plan.plan_id)
  if (planIds.length > 0) {
    const { error } = await admin.from('task_progress').delete().in('plan_id', planIds)
    if (error && !isMissingRelationError(error.message)) {
      console.warn('[e2e/db] reset task_progress failed:', error.message)
    }
  }

  // Best-effort cleanup — individual errors are logged but non-fatal because
  // the tables are optional depending on which migrations are applied.
  const userScopedTables = [
    'artifacts',
    'learner_state',
    'mentor_memory',
    'hearing_chat_messages',
    'lesson_chat_messages',
    'lesson_feedback',
    'user_progress',
    'telemetry_events',
    'workspace_snapshots',
    'goal_history',
    'compiled_plans',
    'milestone_progress',
    'certificates',
  ]

  for (const table of userScopedTables) {
    const { error } = await admin.from(table).delete().eq('user_id', uid)
    if (error && !isMissingRelationError(error.message)) {
      console.warn(`[e2e/db] reset ${table} failed:`, error.message)
    }
  }
}

/**
 * Seed a minimal plan / learner state for the test user so specs that need
 * a returning-user experience can render the workspace view immediately.
 */
export async function seedTestPlan(userId?: string): Promise<void> {
  const admin = await getAdminClient()
  if (!admin) return

  const uid = userId ?? (await ensureTestUser())?.id
  if (!uid) return

  const { error } = await admin.from('learner_state').upsert(
    {
      user_id: uid,
      target_outcome: 'ポートフォリオサイトを公開したい',
      skill_level: 'beginner',
      active_track_id: 'web-builder-ai',
    },
    { onConflict: 'user_id' },
  )
  if (error && !/relation.*does not exist/i.test(error.message)) {
    console.warn('[e2e/db] seedTestPlan failed:', error.message)
  }
}

export async function seedGoalTreeFixtureWithContext(
  context: SeedFixtureContext,
): Promise<{
  goalId: string
  userId: string
  lessonId: string
}> {
  const { admin, uid } = context
  const ledger = getDecisionLedgerClient(admin)

  await runSeedFixtureStep(
    'seedGoalTreeFixture',
    'match cleanup',
    ledger.from('goal_node_lesson_matches').delete().in('id', [...GOAL_TREE_FIXTURE_MATCH_IDS]),
  )

  await runSeedFixtureStep(
    'seedGoalTreeFixture',
    'node cleanup',
    ledger.from('goal_nodes').delete().in('id', [...GOAL_TREE_FIXTURE_NODE_IDS]),
  )

  await runSeedFixtureStep(
    'seedGoalTreeFixture',
    'goal cleanup',
    ledger.from('goals').delete().in('id', [GOAL_TREE_FIXTURE_GOAL_ID]),
  )

  await runSeedFixtureStep(
    'seedGoalTreeFixture',
    'goal insert',
    ledger.from('goals').insert({
      id: GOAL_TREE_FIXTURE_GOAL_ID,
      user_id: uid,
      title: 'ポートフォリオサイトを公開する',
      description: 'goal tree E2E fixture',
      status: 'active',
      metadata: { source: 'playwright-goal-tree' },
    }),
  )

  await runSeedFixtureStep(
    'seedGoalTreeFixture',
    'node insert',
    ledger.from('goal_nodes').insert(GOAL_TREE_FIXTURE_NODES),
  )

  await runSeedFixtureStep(
    'seedGoalTreeFixture',
    'match insert',
    ledger.from('goal_node_lesson_matches').insert(GOAL_TREE_FIXTURE_MATCHES),
  )

  return {
    goalId: GOAL_TREE_FIXTURE_GOAL_ID,
    userId: uid,
    lessonId: GOAL_TREE_FIXTURE_LESSON_ID,
  }
}

export async function seedGoalTreeFixture(userId?: string): Promise<{
  goalId: string
  userId: string
  lessonId: string
} | null> {
  const admin = await getAdminClient()
  if (!admin) return null

  const uid = userId ?? (await ensureTestUser())?.id
  if (!uid) return null

  return seedGoalTreeFixtureWithContext({ admin, uid })
}

export async function seedGoalContextFixtureWithContext(
  context: SeedFixtureContext,
  options: {
    resetUserData?: SeedFixtureReset
    namespace?: GoalContextFixtureNamespace
  } = {},
): Promise<{
  goalId: string
  userId: string
}> {
  const { admin, uid } = context
  const fixture = buildGoalContextFixture(options.namespace ?? 'default')

  if (options.resetUserData) {
    await options.resetUserData(uid)
  }

  const ledger = getDecisionLedgerClient(admin)

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'context cleanup',
    ledger.from('goal_contexts').delete().in('id', fixture.goalContexts.map((contextItem) => contextItem.id)),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'agent_run cleanup',
    ledger.from('agent_runs').delete().in('id', fixture.agentRuns.map((run) => run.id)),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'node cleanup',
    ledger.from('goal_nodes').delete().in('id', fixture.nodes.map((node) => node.id)),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'goal cleanup',
    ledger.from('goals').delete().in('id', [fixture.goalId]),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'artifact cleanup',
    admin.from('artifacts').delete().in('id', fixture.artifacts.map((artifact) => artifact.id)),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'memory cleanup',
    admin.from('mentor_memory').delete().in('id', fixture.memories.map((memory) => memory.id)),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'goal insert',
    ledger.from('goals').insert({
      id: fixture.goalId,
      user_id: uid,
      title: GOAL_CONTEXT_FIXTURE_TITLE,
      description: 'goal context E2E fixture',
      status: 'active',
      metadata: {
        source: 'playwright-goal-context',
        plan_id: fixture.planId,
      },
    }),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'node insert',
    ledger.from('goal_nodes').insert(fixture.nodes),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'context insert',
    ledger.from('goal_contexts').insert(fixture.goalContexts),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'agent_run insert',
    ledger.from('agent_runs').insert(fixture.agentRuns),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'profile upsert',
    admin.from('learner_profile').upsert(
      {
        user_id: uid,
        display_name: 'E2E Learner',
        locale: 'ja',
        experience_summary: 'React / Next.js を触り始めた',
        operating_system: 'macOS',
        cli_familiarity: 'basic',
        available_ai_tools: ['ChatGPT'],
        can_use_local_tools: true,
      },
      { onConflict: 'user_id' },
    ),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'state upsert',
    admin.from('learner_state').upsert(
      {
        user_id: uid,
        target_outcome: GOAL_CONTEXT_FIXTURE_TITLE,
        skill_level: 'beginner',
        blockers: ['copy polish'],
        signals: {
          has_node: true,
          has_git_repo: true,
          wants_database_app: true,
        },
      },
      { onConflict: 'user_id' },
    ),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'memory insert',
    admin.from('mentor_memory').insert(
      fixture.memories.map((memory) => ({
        ...memory,
        user_id: uid,
      })),
    ),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'artifact insert',
    admin.from('artifacts').insert(
      fixture.artifacts.map((artifact) => ({
        ...artifact,
        user_id: uid,
      })),
    ),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'compiled_plan insert',
    admin.from('compiled_plans').insert({
      ...fixture.compiledPlan,
      user_id: uid,
    }),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'task_progress insert',
    admin.from('task_progress').insert(fixture.taskProgress),
  )

  await runSeedFixtureStep(
    'seedGoalContextFixture',
    'telemetry insert',
    admin.from('telemetry_events').insert({
      ...fixture.telemetryEvent,
      user_id: uid,
    }),
  )

  return {
    goalId: fixture.goalId,
    userId: uid,
  }
}

export async function seedGoalContextFixture(options: {
  userId?: string
  namespace?: GoalContextFixtureNamespace
} = {}): Promise<{
  goalId: string
  userId: string
} | null> {
  const admin = await getAdminClient()
  if (!admin) return null

  const uid = options.userId ?? (await ensureTestUser())?.id
  if (!uid) return null

  return seedGoalContextFixtureWithContext(
    { admin, uid },
    {
      namespace: options.namespace,
    },
  )
}

export async function seedAsk2ActionPlanFixtureWithContext(
  context: SeedFixtureContext,
  options: {
    resetUserData?: SeedFixtureReset
  } = {},
): Promise<{
  goalId: string
  userId: string
  planId: string
}> {
  const { admin, uid } = context

  if (options.resetUserData) {
    await options.resetUserData(uid)
  }

  const ledger = getDecisionLedgerClient(admin)

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'context cleanup',
    ledger.from('goal_contexts').delete().eq('goal_id', ASK2ACTION_FIXTURE_LEDGER_GOAL_ID),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'node cleanup',
    ledger.from('goal_nodes').delete().eq('goal_id', ASK2ACTION_FIXTURE_LEDGER_GOAL_ID),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'ledger goal cleanup',
    ledger.from('goals').delete().in('id', [ASK2ACTION_FIXTURE_LEDGER_GOAL_ID]),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'public goal cleanup',
    admin.from('goals').delete().eq('user_id', uid),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'memory cleanup',
    admin.from('mentor_memory').delete().in('id', [...ASK2ACTION_FIXTURE_MEMORY_IDS]),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'public goal insert',
    admin.from('goals').insert({
      id: ASK2ACTION_FIXTURE_PUBLIC_GOAL_ID,
      user_id: uid,
      outcome: ASK2ACTION_FIXTURE_GOAL_TEXT,
      preferred_tools: ['claude-code'],
      domain_ids: [],
      status: 'active',
      current_skill: null,
      deadline: null,
      learning_style: null,
      environment: null,
      constraints: null,
      structured_intent: null,
    }),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'compiled plan insert',
    admin.from('compiled_plans').insert({
      user_id: uid,
      plan_id: ASK2ACTION_FIXTURE_PLAN_ID,
      goal: ASK2ACTION_FIXTURE_GOAL_TEXT,
      status: 'active',
      rationale: 'TQ-170 ask2action e2e fixture',
      coverage_score: 1,
      unsupported_capabilities: [],
      steps: [
        {
          atom_id: 'atom.ask2action.fixture.1',
          atom_title: 'ヒーローの方向性を決める',
          milestone_id: 'ms-tq170-1',
          milestone_title: '最初の画面を固める',
          milestone_description: '公開前に最初の印象を固める',
          sort_order: 1,
          rationale: '何を見せるページかを先に決めると、その後の迷いが減ります。',
          estimated_minutes: 20,
          prerequisite_atom_ids: [],
          soft_prerequisite_atom_ids: [],
          completed_at: null,
          goal_tags: ['website-launch'],
          plan_source: 'ai',
        },
        {
          atom_id: 'atom.ask2action.fixture.2',
          atom_title: '公開導線を整える',
          milestone_id: 'ms-tq170-2',
          milestone_title: '公開導線を用意する',
          milestone_description: '問い合わせや CTA を置く',
          sort_order: 2,
          rationale: 'ヒーローが決まったら、次は公開導線に落とし込みます。',
          estimated_minutes: 25,
          prerequisite_atom_ids: ['atom.ask2action.fixture.1'],
          soft_prerequisite_atom_ids: [],
          completed_at: null,
          goal_tags: ['website-launch'],
          plan_source: 'ai',
        },
      ],
    }),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'ledger goal insert',
    ledger.from('goals').insert({
      id: ASK2ACTION_FIXTURE_LEDGER_GOAL_ID,
      user_id: uid,
      title: ASK2ACTION_FIXTURE_GOAL_TEXT,
      description: 'Ask2Action E2E fixture',
      status: 'active',
      metadata: {
        plan_id: ASK2ACTION_FIXTURE_PLAN_ID,
        source: 'playwright-ask2action',
      },
    }),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'node insert',
    ledger.from('goal_nodes').insert(ASK2ACTION_FIXTURE_NODES),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'profile upsert',
    admin.from('learner_profile').upsert(
      {
        user_id: uid,
        display_name: 'Ask2Action Learner',
        locale: 'ja',
        operating_system: 'macOS',
        cli_familiarity: 'basic',
        available_ai_tools: ['claude-code'],
        can_use_local_tools: true,
      },
      { onConflict: 'user_id' },
    ),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'state upsert',
    admin.from('learner_state').upsert(
      {
        user_id: uid,
        target_outcome: ASK2ACTION_FIXTURE_GOAL_TEXT,
        skill_level: 'beginner',
        blockers: ['手順が不明'],
        signals: {
          has_node: true,
          has_git_repo: true,
        },
      },
      { onConflict: 'user_id' },
    ),
  )

  await runSeedFixtureStep(
    'seedAsk2ActionPlanFixture',
    'memory insert',
    admin.from('mentor_memory').insert(
      ASK2ACTION_FIXTURE_MEMORIES.map((memory) => ({
        ...memory,
        user_id: uid,
      })),
    ),
  )

  return {
    goalId: ASK2ACTION_FIXTURE_LEDGER_GOAL_ID,
    userId: uid,
    planId: ASK2ACTION_FIXTURE_PLAN_ID,
  }
}

export async function seedAsk2ActionPlanFixture(userId?: string): Promise<{
  goalId: string
  userId: string
  planId: string
} | null> {
  const admin = await getAdminClient()
  if (!admin) return null

  const uid = userId ?? (await ensureTestUser())?.id
  if (!uid) return null

  return seedAsk2ActionPlanFixtureWithContext(
    { admin, uid },
    {},
  )
}

/**
 * Returns `true` when the local Supabase stack responded to at least one
 * probe since the process started. Lets specs conditionally skip when they
 * require a real DB but one isn't available.
 */
export function isLocalSupabaseReady(): boolean {
  if (localStackAvailable !== null) {
    return localStackAvailable
  }

  return process.env[LOCAL_SUPABASE_READY_ENV] === 'true'
}
