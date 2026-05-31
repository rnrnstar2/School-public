/**
 * Grounded context populator for SCOPING/INVESTIGATE sub-agent delegates — W66
 * (Audit A4 W13-NEW-1 HIGH).
 *
 * 背景:
 *   W60 で 8 sub-agent (goal-tree / friction-critic / lesson-matcher /
 *   memory-recall / path-planner / tech-scout / tool-scout / judge) に
 *   "grounded context" optional fields (`pastFrictionSnippets` /
 *   `planDraft.stepBriefs` / `learnerProfile.{available_ai_tools,
 *   experience_summary}` / `personaProfile` / `completionCriteria`) を入れたが、
 *   route 層 (`apps/web/src/app/api/mentor/session/route.ts`) の Conductor
 *   delegate body はそのまま空配列 / null を渡していた。LLM は schema 形を
 *   見るだけで実コンテキストが空のまま hallucinate する。
 *
 * 本 module の責務:
 *   - DB / mentor session state から **1 リクエスト 1 回** で grounded context を
 *     収集し、各 sub-agent input にマッピング可能な shape に整形する。
 *   - 失敗 (DB 例外 / 未認証) は **空配列 / null fallback** で握り潰す。route
 *     全体は壊さない（Owner Q5 fail-safe）。
 *   - mentor_memory / learner_profile / compiled_plans は best-effort fetch、
 *     必須ではない。fetch 結果は schema 上 readonly なので caller は cast 不要。
 *   - 出力は per-sub-agent partial input 形式。各 sub-agent input への spread
 *     で grounded fields のみ上書きする (caller が `{ ...base, ...populated }`)。
 *
 * 副作用ゼロ:
 *   - サブエージェントの I/O contract には触らない (schema は W60 で確定済み)。
 *   - 既存 deterministic decomposer / heuristic detector が動く path は不変。
 *
 * 関連:
 *   - `apps/web/src/lib/mentor/sub-agents/goal-tree.ts`
 *   - `apps/web/src/lib/mentor/sub-agents/friction-critic.ts`
 *   - `apps/web/src/lib/mentor/sub-agents/judge.ts`
 *   - `apps/web/src/lib/planner/graduation/calc.ts` (W45)
 *   - `apps/web/src/lib/planner/mentor-memory-query.ts`
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'
import type { LearnerProfile } from '@/types'
import type { LearnerCliFamiliarity } from '@/types'
import type { PlannerHearingSession } from '@/lib/planner/types'
import {
  calcGraduationOptions,
  type GraduationOption,
} from '@/lib/planner/graduation/calc'
import { fetchPlannerMentorMemoryBullets } from '@/lib/planner/mentor-memory-query'

// ── Public types ────────────────────────────────────────────────────

/**
 * 収集済み grounded context の最終形。各 sub-agent delegate でこの object から
 * 必要なフィールドだけ拾って input に詰める。
 */
export interface MentorGroundedContext {
  /**
   * `learner_profile` テーブル由来。`available_ai_tools` /
   * `experience_summary` / `cli_familiarity` を grounded で渡すための材料。
   * fetch 失敗 / 未登録の場合は null。
   */
  learnerProfile: {
    /** Normalized to `LearnerCliFamiliarity` enum values; unknown strings → null. */
    cliFamiliarity: LearnerCliFamiliarity | null
    availableAiTools: string[]
    experienceSummary: string | null
  }
  /**
   * 過去の friction memory snippet (top-K)。 mentor_memory + archive を
   * `fetchPlannerMentorMemoryBullets` で取得し、friction 関連キーワードで
   * フィルタ。空配列フォールバック。
   */
  pastFrictionSnippets: string[]
  /**
   * 既存 active plan の step brief (top-K)。`compiled_plans` (status=active)
   * から steps を pluck して `{ stepId, title, rationale, recommendedTool }`
   * 形式に正規化。plan 不在 / fetch 失敗の場合は空配列。
   */
  planStepBriefs: Array<{
    stepId: string
    title: string | null
    rationale: string | null
    recommendedTool: string | null
  }>
  /**
   * Hearing で確定した先頭 personaId に対応する personaProfile。`personaTags`
   * は session.personaIds をそのまま流す。BYOK / hearing answers から導出した
   * `available_ai_tools` / `cli_familiarity` を集約。
   *
   * persona ID 不在の場合でも learnerProfile の値で埋める fallback を持つ
   * （Judge 側の null 分岐を最小化する）。
   */
  personaProfile: {
    cliFamiliarity: LearnerCliFamiliarity | null
    personaTags: string[]
    availableAiTools: string[]
    experienceSummary: string | null
    skillLevel: string | null
  } | null
  /**
   * persona × goal で resolve した卒業基準テキスト (top-K)。
   * `calcGraduationOptions` を呼び、option label + criteria_yaml hint を
   * 文字列化したリストとして渡す。
   */
  completionCriteria: string[]
}

// ── Constants ───────────────────────────────────────────────────────

const MEMORY_BULLET_FETCH_LIMIT = 20
const PAST_FRICTION_TOP_K = 5
const PLAN_STEP_BRIEF_TOP_K = 10
const COMPLETION_CRITERIA_TOP_K = 8

/**
 * mentor_memory bullets から「friction (詰まり / 失敗 / blocker)」っぽい
 * snippet を抽出するためのキーワード。bullet 本文 / title 両方に対して
 * 部分一致でフィルタする。
 *
 * 過剰一致を防ぐため、`できた` / `成功` のような肯定語も入れない（純粋な
 * friction signal だけ拾う）。
 */
const FRICTION_KEYWORDS_LOWER = [
  // 日本語
  '詰ま',
  '詰り',
  '失敗',
  '困',
  'blocker',
  'ブロッカー',
  'エラー',
  'error',
  '進まな',
  '進めな',
  '止ま',
  '迷',
  'わからな',
  '分からな',
  'よく分からな',
  '無理',
  'うまくいかな',
  'うまく行かな',
  'できなかった',
  '出来なかった',
  // 英語
  'fail',
  'stuck',
  'blocked',
  'confus',
  "can't",
  'cannot',
  'unable',
]

// ── Builder ─────────────────────────────────────────────────────────

export interface BuildGroundedContextInput {
  client: SupabaseClient<Database>
  userId: string
  goal: string
  /** Hearing session (= session を toPlannerHearingSession したもの)。 */
  plannerSession: PlannerHearingSession | null
  /**
   * 確定済みの persona ID 配列 (任意)。route 層で
   * `session.personaIds ?? plannerSession.personaIds` を解決済みのものを
   * 渡せる。未指定なら plannerSession から拾う。
   */
  personaIds?: string[] | null
}

/**
 * SCOPING/INVESTIGATE delegate が呼ぶ grounded context builder。
 *
 * 1 リクエスト 1 回呼ばれる前提で、mentor_memory / learner_profile /
 * compiled_plans を **並列 fetch** し、結果を組み立てて返す。失敗は graceful
 * (空配列 / null) で握り潰す。
 */
export async function buildMentorGroundedContext(
  input: BuildGroundedContextInput,
): Promise<MentorGroundedContext> {
  const { client, userId, goal, plannerSession } = input
  const personaIds: string[] = Array.isArray(input.personaIds)
    ? input.personaIds
    : plannerSession?.personaIds ?? []

  // 並列 fetch — 全部 best-effort、失敗は握り潰し空にフォールバック。
  const [profileResult, memoryResult, planResult] = await Promise.allSettled([
    fetchLearnerProfile(client, userId),
    fetchMentorMemoryBullets(client, userId, MEMORY_BULLET_FETCH_LIMIT),
    fetchActivePlanSteps(client, userId),
  ])

  const learnerProfile = unwrapSettled(profileResult)
  const memoryBullets = unwrapSettled(memoryResult) ?? []
  const planSteps = unwrapSettled(planResult) ?? []

  // 1. learner profile fields — DB 値を優先、空なら hearing answers で補完
  const profileFields = buildLearnerProfileFields({
    learnerProfile: learnerProfile ?? null,
    plannerSession,
  })

  // 2. past friction snippets — friction-related bullets だけ filter
  const pastFrictionSnippets = filterFrictionSnippets(
    memoryBullets,
    PAST_FRICTION_TOP_K,
  )

  // 3. plan step briefs
  const planStepBriefs = planSteps
    .slice(0, PLAN_STEP_BRIEF_TOP_K)
    .map((step) => ({
      stepId: step.stepId,
      title: step.title,
      rationale: step.rationale,
      recommendedTool: step.recommendedTool,
    }))

  // 4. persona profile (judge 用) — personaIds + 学習者 profile fields
  const personaProfile = buildPersonaProfile({
    personaIds,
    learnerProfile: learnerProfile ?? null,
    profileFields,
  })

  // 5. completion criteria — calcGraduationOptions(persona, goalSlug)
  const completionCriteria = buildCompletionCriteria({
    personaIds,
    goalText: goal,
  })

  return {
    learnerProfile: profileFields,
    pastFrictionSnippets,
    planStepBriefs,
    personaProfile,
    completionCriteria,
  }
}

// ── Internal: fetchers ──────────────────────────────────────────────

async function fetchLearnerProfile(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<LearnerProfile | null> {
  const { data } = await client
    .from('learner_profile')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as LearnerProfile | null) ?? null
}

async function fetchMentorMemoryBullets(
  client: SupabaseClient<Database>,
  userId: string,
  limit: number,
): Promise<string[]> {
  return fetchPlannerMentorMemoryBullets(client, userId, limit)
}

interface PlanStepBriefRaw {
  stepId: string
  title: string | null
  rationale: string | null
  recommendedTool: string | null
}

async function fetchActivePlanSteps(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<PlanStepBriefRaw[]> {
  const { data } = await (client as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{
                  data: { steps: unknown } | null
                  error: { message: string } | null
                }>
              }
            }
          }
        }
      }
    }
  })
    .from('compiled_plans')
    .select('plan_id, steps')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const stepsRaw = data && Array.isArray((data as { steps: unknown }).steps)
    ? ((data as { steps: unknown[] }).steps)
    : []

  const briefs: PlanStepBriefRaw[] = []
  for (const entry of stepsRaw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const stepId = pickString(obj, ['stepId', 'step_id', 'atomId', 'atom_id', 'id'])
    if (!stepId) continue
    briefs.push({
      stepId,
      title: pickString(obj, ['title', 'atomTitle', 'atom_title']) ?? null,
      rationale: pickString(obj, ['rationale', 'reason', 'why']) ?? null,
      recommendedTool:
        pickString(obj, ['recommendedTool', 'recommended_tool', 'tool']) ?? null,
    })
  }
  return briefs
}

function pickString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

// ── Internal: builders ──────────────────────────────────────────────

interface ProfileFields {
  cliFamiliarity: LearnerCliFamiliarity | null
  availableAiTools: string[]
  experienceSummary: string | null
}

/**
 * 文字列を `LearnerCliFamiliarity` enum に正規化する。
 * 未知の値 / 空文字 → null。
 */
function normalizeCliFamiliarity(value: unknown): LearnerCliFamiliarity | null {
  if (typeof value !== 'string') return null
  const lower = value.trim().toLowerCase()
  if (lower === 'none') return 'none'
  if (lower === 'basic' || lower === 'beginner' || lower === 'low') return 'basic'
  if (lower === 'comfortable' || lower === 'medium' || lower === 'advanced' || lower === 'expert')
    return 'comfortable'
  return null
}

function buildLearnerProfileFields(args: {
  learnerProfile: LearnerProfile | null
  plannerSession: PlannerHearingSession | null
}): ProfileFields {
  const profile = args.learnerProfile
  const answers = args.plannerSession?.answers ?? {}

  // profile 値も DB に古い enum (e.g. 'beginner' / 'expert') が残る可能性が
  // あるため normalize して LearnerCliFamiliarity 範囲に収める。
  const cliFromProfile = normalizeCliFamiliarity(profile?.cli_familiarity)
  const cliFromAnswers = normalizeCliFamiliarity(answers.cliFamiliarity)

  const toolsFromProfile = Array.isArray(profile?.available_ai_tools)
    ? (profile?.available_ai_tools ?? []).filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      )
    : []
  const toolsFromAnswers = parseToolsAnswer(answers.aiTools)

  const expFromProfile = profile?.experience_summary?.trim()
    ? profile.experience_summary.trim()
    : null
  const expFromAnswers =
    typeof answers.experience === 'string' && answers.experience.trim()
      ? answers.experience.trim()
      : null

  return {
    cliFamiliarity: cliFromProfile ?? cliFromAnswers,
    availableAiTools:
      toolsFromProfile.length > 0 ? toolsFromProfile : toolsFromAnswers,
    experienceSummary: expFromProfile ?? expFromAnswers,
  }
}

/**
 * `aiTools` answer は free text。カンマ / 読点 / スラッシュで split し、
 * 最大 8 件まで返す。
 */
function parseToolsAnswer(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  return value
    .split(/[,、，\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 8)
}

function filterFrictionSnippets(bullets: string[], topK: number): string[] {
  const out: string[] = []
  for (const bullet of bullets) {
    if (out.length >= topK) break
    if (typeof bullet !== 'string') continue
    const lower = bullet.toLowerCase()
    if (FRICTION_KEYWORDS_LOWER.some((kw) => lower.includes(kw))) {
      out.push(bullet.length > 200 ? `${bullet.slice(0, 200)}…` : bullet)
    }
  }
  return out
}

function buildPersonaProfile(args: {
  personaIds: string[]
  learnerProfile: LearnerProfile | null
  profileFields: ProfileFields
}): MentorGroundedContext['personaProfile'] {
  const personaTags = Array.isArray(args.personaIds)
    ? args.personaIds.filter((s): s is string => typeof s === 'string').slice(0, 8)
    : []

  // persona ID も learner profile も無い → null (Judge は personaProfile=null
  // のとき hallucinate しないよう context を最小化する側に倒す契約)。
  if (
    personaTags.length === 0 &&
    !args.profileFields.cliFamiliarity &&
    args.profileFields.availableAiTools.length === 0 &&
    !args.profileFields.experienceSummary
  ) {
    return null
  }

  return {
    cliFamiliarity: args.profileFields.cliFamiliarity,
    personaTags,
    availableAiTools: args.profileFields.availableAiTools,
    experienceSummary: args.profileFields.experienceSummary,
    skillLevel: null,
  }
}

function buildCompletionCriteria(args: {
  personaIds: string[]
  goalText: string
}): string[] {
  const personaSlug = args.personaIds[0] ?? null
  const goalSlug = inferGoalSlugFromText(args.goalText)
  const result = calcGraduationOptions({
    personaSlug,
    goalSlug,
  })
  return result.options
    .slice(0, COMPLETION_CRITERIA_TOP_K)
    .map(formatGraduationOption)
    .filter((s) => s.length > 0)
}

function formatGraduationOption(option: GraduationOption): string {
  const parts: string[] = [option.label]
  if (option.criteria_yaml) {
    // criteria_yaml は YAML 風 1-2 行。最初の url_pattern 行だけを hint として残す。
    const lines = option.criteria_yaml
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const hint = lines.find((l) => l.startsWith('url_pattern:')) ?? null
    if (hint) parts.push(`(${hint})`)
  }
  if (option.requires_explanation) {
    parts.push('(自由記述で根拠を添える)')
  }
  const joined = parts.join(' ')
  return joined.length > 200 ? `${joined.slice(0, 200)}…` : joined
}

/**
 * Goal 文から calc 用の goalSlug を推定する。完全なヒューリスティック。
 * `calcGraduationOptions` が matrix lookup で使う key は
 * `web-builder` / `ai-content` / `automation` / `freelancer` / `marketer` /
 * `designer` 等。当たらなければ null を返し、persona 単独 fallback に任せる。
 */
function inferGoalSlugFromText(goal: string): string | null {
  if (typeof goal !== 'string') return null
  const lower = goal.toLowerCase()
  if (/(動画|video|youtube|tiktok|reel|shorts|配信)/.test(lower)) {
    return 'ai-content'
  }
  if (/(自動化|automation|workflow|ワークフロー|n8n|zapier|make\.com)/.test(lower)) {
    return 'automation'
  }
  if (/(landing|lp|ランディング|キャンペーン|campaign|プロモ)/.test(lower)) {
    return 'marketer'
  }
  if (/(figma|デザイン|design)/.test(lower)) {
    return 'designer'
  }
  if (/(freelanc|フリーランス|案件|受注)/.test(lower)) {
    return 'freelancer'
  }
  if (
    /(web|サイト|ホームページ|ポートフォリオ|portfolio|app|アプリ|service|サービス|saas)/.test(
      lower,
    )
  ) {
    return 'web-builder'
  }
  return null
}

// ── Internal: util ──────────────────────────────────────────────────

function unwrapSettled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null
}
