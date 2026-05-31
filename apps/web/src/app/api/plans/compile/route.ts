import * as Sentry from '@sentry/nextjs'
import { after } from 'next/server'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_AI, validateBody } from '@/lib/api/guard'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import {
  getLatestActiveCompiledPlan,
  persistCompiledPlanSnapshot,
  type ActiveCompiledPlanSnapshot,
  type PersistCompiledPlanSnapshotResult,
} from '@/lib/compiled-plans'
import {
  buildAtomPlanFromGoalCached,
  buildAtomPlanFromGoalWithAI,
  computePlanSeedFromGoalInput,
  type AtomCompiledPlan,
} from '@/lib/planner/goal-first'
import { fetchPlannerMentorMemoryBullets } from '@/lib/planner/mentor-memory-query'
import {
  formatGoalTreeShadowError,
  isG2AShadowWriteEnabled,
  runGoalTreeShadowWrite,
} from '@/lib/planner/goal-tree-shadow'
import { emitTelemetryEvent } from '@/lib/telemetry'

const compileSchema = z.object({
  goal: z.string().min(1, 'ゴールを入力してください').max(500),
  goalTags: z.array(z.string().max(100)).max(20).optional(),
  personaIds: z.array(z.string().max(200)).max(20).optional(),
  learnerState: z.object({
    skillLevel: z.string().max(100).nullable().optional(),
    blockers: z.array(z.string().max(500)).max(20).optional(),
    signals: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  hearingSummary: z.object({
    keyPoints: z.array(z.string().max(500)).max(30).optional(),
    lastSessionCompletedAt: z.string().max(64).optional(),
  }).optional(),
})

function buildLearnerState(input: z.infer<typeof compileSchema>['learnerState'] | undefined) {
  return {
    skillLevel: input?.skillLevel ?? null,
    blockers: input?.blockers ?? [],
    signals: input?.signals ?? {},
  }
}

function queueShadowWrite(task: () => void | Promise<void>) {
  after(task)
}

function planCompileFailedResponse(request: Request) {
  return jsonResponse(
    {
      error: 'plan_compile_failed',
      message: 'プランの生成に失敗しました。',
    },
    { status: 500 },
    request,
  )
}

/**
 * W47 (CR-1, Audit B D1): Conductor (mentor session) が SYNTH/COMMIT で
 * persist した `compiled_plans` 行を、直後の onboarding confirm の
 * `/api/plans/compile` で再 compile + supersedePlanIds で上書きしないための
 * skip ガード時間枠（ミリ秒）。
 *
 * Conductor の SYNTH→COMMIT パスは現状 onboarding confirm と数秒以内に走る。
 * Owner Vision の AI フル活用 / ZAI 二重 call 削減（コスト 2x）の観点で、
 * 短時間内の同一 user × goal × persona の重複 compile は skip する。
 *
 * 値は短めに倒す（10 分）：
 * - 学習者が編集後に「やり直したい」と能動的に compile を呼んだ場合は
 *   normal path に流す（compile はそもそも稀な操作）
 * - Conductor 経由の永続化と onboarding confirm の compile 呼び出しは
 *   この window 内に収まる（実測 < 60s）
 */
const ACTIVE_PLAN_REUSE_WINDOW_MS = 10 * 60 * 1000

/**
 * W47 (CR-1): activePlan が「直近の Conductor 出力」と判断できれば true を返す。
 *
 * 判定:
 *   - 同一 goal（trim 一致）
 *   - 同一 personaId（先頭 personaId vs activePlan.personaId、両方 null も可）
 *   - createdAt が ACTIVE_PLAN_REUSE_WINDOW_MS 内
 *   - plan に少なくとも 1 step ある（空 plan は再 compile すべき）
 *
 * これらが揃わなければ false → normal compile path に流す。
 */
function shouldReuseActivePlan(args: {
  activePlan: ActiveCompiledPlanSnapshot | null
  goal: string
  personaIds: string[] | undefined
  now?: number
}): boolean {
  const { activePlan, goal, personaIds } = args
  if (!activePlan) return false
  if (!activePlan.plan) return false
  if (!Array.isArray(activePlan.plan.steps) || activePlan.plan.steps.length === 0) return false
  if (activePlan.goal.trim() !== goal.trim()) return false

  const incomingPersonaId = personaIds?.[0] ?? null
  if (incomingPersonaId !== activePlan.personaId) return false

  if (!activePlan.createdAt) return false
  const createdAtMs = Date.parse(activePlan.createdAt)
  if (!Number.isFinite(createdAtMs)) return false

  const now = args.now ?? Date.now()
  const ageMs = now - createdAtMs
  if (ageMs < 0) return false
  if (ageMs > ACTIVE_PLAN_REUSE_WINDOW_MS) return false

  return true
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'plans-compile:post', RL_AI)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, compileSchema)
  if ('error' in parsed) return parsed.error

  const body = parsed.data
  const goal = body.goal.trim()
  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    // Unauthenticated preview: the cache wrapper can't hit (no userId)
    // so this is effectively a pass-through to buildAtomPlanFromGoal, but
    // going through the wrapper keeps a single code path for call-site
    // consistency.
    try {
      const previewResult = await buildAtomPlanFromGoalCached({
        goal,
        goalTags: body.goalTags,
        personaIds: body.personaIds,
        learnerState: buildLearnerState(body.learnerState),
        hearingSummary: body.hearingSummary,
      })

      const response = jsonResponse(
        {
          data: {
            planId: null,
            plan: previewResult.plan,
            preview: true,
          },
        },
        {},
        request,
      )

      return response
    } catch (error) {
      console.warn('[plans/compile] preview compilation failed:', error)
      return planCompileFailedResponse(request)
    }
  }

  const [persistedLearnerStateResult, activePlan, mentorMemoryBullets] = await Promise.all([
    client
      .from('learner_state')
      .select('skill_level, blockers, signals')
      .eq('user_id', user.id)
      .maybeSingle(),
    getLatestActiveCompiledPlan({
      userId: user.id,
      client,
    }),
    fetchPlannerMentorMemoryBullets(client, user.id, 10).catch((error) => {
      console.warn('[plans/compile] mentor memory lookup failed:', error)
      return []
    }),
  ])
  const persistedLearnerState = persistedLearnerStateResult.data
  const mergedLearnerState = {
    skillLevel: body.learnerState?.skillLevel ?? persistedLearnerState?.skill_level ?? null,
    blockers: body.learnerState?.blockers ?? persistedLearnerState?.blockers ?? [],
    signals: body.learnerState?.signals ?? persistedLearnerState?.signals ?? {},
  }

  // ── W47 (CR-1, Audit B D1): Conductor 出力保護 ─────────────────────
  // 直前の Conductor SYNTH/COMMIT が persist した active plan が「直近の
  // 同一 user × goal × persona の出力」と判断できれば、再 compile を
  // **skip して既存 plan を返す**。これにより Conductor の Goal Tree +
  // Mode B 統合 plan が onboarding confirm の compile で上書きされる
  // CRITICAL バグを解消する（ZAI 二重 call の cost 2x も削減）。
  if (
    shouldReuseActivePlan({
      activePlan,
      goal,
      personaIds: body.personaIds,
    })
  ) {
    if (process.env.NODE_ENV !== 'test') {
      console.debug('[plans/compile] reusing active plan from Conductor', {
        userId: user.id,
        planId: activePlan?.planId,
        createdAt: activePlan?.createdAt,
      })
    }
    return jsonResponse(
      {
        data: {
          planId: activePlan?.planId ?? null,
          plan: activePlan?.plan,
          reused: true,
        },
      },
      {},
      request,
    )
  }

  // Try AI-powered plan first for authenticated users, fall back to the
  // cache-aware deterministic path so subsequent requests with identical
  // inputs can short-circuit via compiled_plans.plan_seed.
  const builderInput = {
    goal,
    goalTags: body.goalTags,
    personaIds: body.personaIds,
    userId: user.id,
    learnerState: mergedLearnerState,
    hearingSummary: body.hearingSummary,
    mentorMemoryBullets,
  }

  let atomPlan: AtomCompiledPlan
  let planSeed: string | null
  let persisted: PersistCompiledPlanSnapshotResult
  try {
    const aiPlan = await buildAtomPlanFromGoalWithAI(builderInput)

    if (aiPlan) {
      atomPlan = aiPlan
      // AI path doesn't consult the cache, but we still compute + persist the
      // seed so the next identical request hits the cache immediately.
      planSeed = computePlanSeedFromGoalInput(builderInput)
    } else {
      const cachedResult = await buildAtomPlanFromGoalCached(builderInput)
      atomPlan = cachedResult.plan
      planSeed = cachedResult.seed
    }

    persisted = await persistCompiledPlanSnapshot({
      client,
      userId: user.id,
      goal,
      plan: atomPlan,
      planSeed,
      personaId: body.personaIds?.[0] ?? activePlan?.personaId ?? null,
      parentPlanId: activePlan?.planId ?? null,
      supersedePlanIds: activePlan?.planId ? [activePlan.planId] : [],
      status: 'active',
    })
  } catch (error) {
    console.warn('[plans/compile] compilation failed; skipping persistence:', error)
    return planCompileFailedResponse(request)
  }

  if (persisted.planId) {
    await emitTelemetryEvent({
      userId: user.id,
      eventName: 'plan_generated',
      planId: persisted.planId,
      requestId: getRequestId(request),
      properties: {
        goal,
        goal_tags: body.goalTags ?? atomPlan.goalTags,
        persona_ids: body.personaIds ?? [],
        step_count: atomPlan.steps.length,
        source: 'plans_compile',
      },
    }).catch(() => undefined)
  }

  const response = jsonResponse(
    {
      data: {
        planId: persisted.planId,
        plan: atomPlan,
        persistence: persisted,
      },
    },
    {},
    request,
  )

  if (isG2AShadowWriteEnabled()) {
    queueShadowWrite(async () => {
      try {
        await runGoalTreeShadowWrite({
          userId: user.id,
          goal,
          goalTags: body.goalTags,
          personaIds: body.personaIds,
          learnerState: mergedLearnerState,
          planId: persisted.planId,
          planSeed,
          atomPlan,
        })
      } catch (error) {
        Sentry.captureMessage('G2A shadow write failed', {
          level: 'warning',
          tags: {
            route: 'plans_compile',
          },
          extra: {
            user_id: user.id,
            goal,
            plan_id: persisted.planId,
            plan_seed: planSeed,
            error: formatGoalTreeShadowError(error),
          },
        })
      }
    })
  }

  return response
}
