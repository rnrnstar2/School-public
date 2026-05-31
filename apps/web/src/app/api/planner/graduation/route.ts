import { createClient } from '@/lib/supabase/server'
import { checkEvidenceBasedGraduation } from '@/lib/planner/graduation'
import {
  calcGraduationOptions,
} from '@/lib/planner/graduation/calc'
import { getCompiledPlanRecord } from '@/lib/compiled-plans'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { graduationRequestSchema } from '@/lib/api/schemas'
import { captureServerEvent } from '@/lib/analytics/server'
import {
  normalizeGoalSlug,
  normalizePersonaSlug,
} from '@/lib/personas/normalize'

// TQ-251 / TQ-252 — /api/planner/graduation
//
// 旧版は固定 evidence_check 1 mode で `graduation_decisions` を hardcoded で書いて
// いた (列構成は plans_v2 を前提とした旧 027 schema)。本 route は:
//   - mode='gate_decision'  : 学習者が選択した graduation gate を upsert
//   - mode='evidence_check' : 既存の evidence-based graduation 判定 (back-compat)
//   - GET ?persona=...&goal=...: persona × goal で動的 options を返す (UI 用)
// を一括で扱い、persona × goal の動的計算は @/lib/planner/graduation/calc に委譲する。

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'graduation_options', RL_READ)
  if (rlResponse) return rlResponse

  const url = new URL(request.url)
  const persona = url.searchParams.get('persona')
  const goal = url.searchParams.get('goal')

  // W52 / Audit G2 — synthetic slug (`P-NONENG-WEBAPP`) や prefix なし
  // (`noneng-webapp`) を canonical (`persona.<slug>`) に正規化してから calc に渡す。
  // これをやらないと matrix 不在で fallback_web_builder に落ちる。
  const result = calcGraduationOptions({
    personaSlug: normalizePersonaSlug(persona),
    goalSlug: normalizeGoalSlug(goal),
  })

  return jsonResponse(
    {
      persona_slug: result.personaSlug,
      goal_slug: result.goalSlug,
      source: result.source,
      options: result.options,
    },
    {},
    request,
  )
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'graduation', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, graduationRequestSchema)
  if ('error' in parsed) return parsed.error

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  // ── mode dispatch ─────────────────────────────────────────────────
  if ('mode' in parsed.data && parsed.data.mode === 'gate_decision') {
    return handleGateDecision(request, supabase, user.id, parsed.data)
  }

  return handleEvidenceCheck(request, supabase, user.id, parsed.data)
}

// ── handler: gate_decision ───────────────────────────────────────────

type GateDecisionPayload = {
  mode: 'gate_decision'
  persona_slug?: string | null
  goal_slug?: string | null
  plan_id?: string | null
  decision: {
    kind: string
    label: string
    artifact_value: string
    explanation?: string | null
  }
}

async function handleGateDecision(
  request: Request,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  payload: GateDecisionPayload,
) {
  // W52 / Audit G2 — POST body の persona / goal も正規化する。
  // (synthetic / prefix なし入力でも 400 invalid_decision_kind に落ちないように)
  const calc = calcGraduationOptions({
    personaSlug: normalizePersonaSlug(payload.persona_slug ?? null),
    goalSlug: normalizeGoalSlug(payload.goal_slug ?? null),
  })

  // option.kind の妥当性チェック (calc 結果 or 'other_artifact' を許容)。
  const validKinds = new Set<string>(calc.options.map((opt) => opt.kind))
  if (!validKinds.has(payload.decision.kind)) {
    return jsonResponse(
      {
        error: 'invalid_decision_kind',
        message: '選択された卒業ゲート種別が persona × goal の有効候補に含まれていません。',
        valid_kinds: Array.from(validKinds),
      },
      { status: 400 },
      request,
    )
  }

  const insertRow = {
    user_id: userId,
    plan_id: payload.plan_id?.trim() || null,
    persona_slug: calc.personaSlug,
    goal_slug: calc.goalSlug,
    decision: {
      kind: payload.decision.kind,
      label: payload.decision.label,
      artifactValue: payload.decision.artifact_value,
      explanation: payload.decision.explanation ?? null,
    },
    status: 'gate_selected',
  }

  // own-row だけが操作可能なので user_id + plan_id (or null) で最新行を読み、
  // あれば update / なければ insert する自前 upsert。
  // Postgres ON CONFLICT を使わない理由: plan_id NULL の row も区別したいので
  // ユニーク制約は張らない設計。
  const existingResult = await supabase
    .from('graduation_decisions' as never)
    .select('id')
    .eq('user_id', userId)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingResult.error && existingResult.error.code !== 'PGRST116') {
    return jsonResponse(
      {
        error: 'graduation_decision_read_failed',
        message: existingResult.error.message,
      },
      { status: 500 },
      request,
    )
  }

  let savedId: string | null = null
  const existingId = (existingResult.data as { id?: string } | null)?.id ?? null
  if (existingId) {
    const updateResult = await supabase
      .from('graduation_decisions' as never)
      .update(insertRow as never)
      .eq('id', existingId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle()
    if (updateResult.error) {
      return jsonResponse(
        {
          error: 'graduation_decision_update_failed',
          message: updateResult.error.message,
        },
        { status: 500 },
        request,
      )
    }
    savedId = (updateResult.data as { id?: string } | null)?.id ?? null
  } else {
    const insertResult = await supabase
      .from('graduation_decisions' as never)
      .insert(insertRow as never)
      .select('id')
      .maybeSingle()
    if (insertResult.error) {
      return jsonResponse(
        {
          error: 'graduation_decision_insert_failed',
          message: insertResult.error.message,
        },
        { status: 500 },
        request,
      )
    }
    savedId = (insertResult.data as { id?: string } | null)?.id ?? null
  }

  captureServerEvent({
    event: 'graduation_gate_selected',
    distinctId: userId,
    properties: {
      persona_slug: calc.personaSlug,
      goal_slug: calc.goalSlug,
      decision_kind: payload.decision.kind,
      source: calc.source,
    },
  })

  return jsonResponse(
    {
      ok: true,
      id: savedId,
      persona_slug: calc.personaSlug,
      goal_slug: calc.goalSlug,
      source: calc.source,
      decision: insertRow.decision,
    },
    {},
    request,
  )
}

// ── handler: evidence_check (既存ロジック) ────────────────────────────

type EvidenceCheckPayload = {
  mode?: 'evidence_check'
  plan_id: string
  track_id?: string
  milestones?: Array<{ id: string; title: string }>
}

async function handleEvidenceCheck(
  request: Request,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _payload: EvidenceCheckPayload,
) {
  const [goalResult, activePlanRecord, evidenceResult, assessmentsResult] = await Promise.all([
    supabase
      .from('goals' as never)
      .select('id, domain_ids')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getCompiledPlanRecord({
      userId,
      status: 'active',
      client: supabase,
    }),
    supabase
      .from('evidence_submissions' as never)
      .select('id, plan_node_id, lesson_id')
      .eq('user_id', userId),
    supabase
      .from('competency_assessments' as never)
      .select('id, capability_id, score')
      .eq('user_id', userId),
  ])

  const goal = goalResult.data as { id: string; domain_ids: string[] } | null
  const plan = activePlanRecord

  if (!goal || !plan) {
    return jsonResponse(
      { error: 'アクティブなゴールまたはプランが見つかりません。' },
      { status: 404 },
      request,
    )
  }

  const planNodes = plan.plan.steps.map((step) => ({
    id: step.atomId,
    status: step.completedAt ? 'completed' : 'pending',
    lesson_id: step.atomId,
  }))
  const evidence = (evidenceResult.data ?? []) as Array<{
    id: string
    plan_node_id: string | null
    lesson_id: string
  }>
  const assessments = (assessmentsResult.data ?? []) as Array<{
    id: string
    capability_id: string
    score: number
  }>
  const capabilities = goal.domain_ids.length > 0
    ? ((await supabase
        .from('capabilities' as never)
        .select('id, label, domain_id')
        .in('domain_id', goal.domain_ids)).data ?? []) as Array<{
          id: string
          label: string
          domain_id: string
        }>
    : []

  const result = checkEvidenceBasedGraduation(
    planNodes,
    evidence,
    assessments,
    capabilities,
  )

  if (result.graduated) {
    await supabase
      .from('graduation_decisions' as never)
      .insert({
        user_id: userId,
        goal_id: goal.id,
        plan_id: plan.planId,
        status: 'graduated',
        competency_summary: {
          scores: result.competencyScores,
          nodesWithEvidence: result.nodesWithEvidence,
          totalRequiredNodes: result.totalRequiredNodes,
        },
      } as never)
  }

  captureServerEvent({
    event: 'graduation_reached',
    distinctId: userId,
    properties: {
      plan_id: plan.planId,
      goal_id: goal.id,
      graduated: result.graduated,
      evidence_based: true,
    },
  })

  return jsonResponse({ graduation: result }, {}, request)
}
