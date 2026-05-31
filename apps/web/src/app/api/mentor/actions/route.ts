import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import { mentorActionSchema } from '@/lib/api/schemas'
import { upsertMentorMemory } from '@/lib/learner-models'
import {
  getCompiledPlanRecord,
  getLatestActiveCompiledPlan,
  updateCompiledPlanSteps,
} from '@/lib/compiled-plans'
import { emitTelemetryEvent } from '@/lib/telemetry'
import { fetchAtomById } from '@/lib/atoms/atom-repository'
import { recompilePlanWithAI } from '@/lib/planner/goal-first/ai-recompile'
import type { RecompileTrigger } from '@/lib/planner/goal-first/ai-recompile'
import { getAiToolById, isKnownAiToolId } from '@/lib/atoms/ai-tools-catalog'
import {
  applyAddLesson,
  applyChangeNextLesson,
  applyReorderSchedule,
  applySkipLesson,
  applySwitchTool,
} from '@/lib/planner/dynamic-plan-edit'

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'mentor-action', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, mentorActionSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const client = await createClient()
  const { data: { user } } = await client.auth.getUser().catch(() => ({ data: { user: null } }))

  switch (body.type) {
    case 'change_next_lesson': {
      if (!body.targetLessonId) {
        return jsonResponse(
          { error: 'missing_target', message: '変更先のレッスンIDが必要です。' },
          { status: 400 },
          request,
        )
      }

      // Verify the target lesson exists in curriculum
      const targetLesson = await fetchAtomById(body.targetLessonId)
      if (!targetLesson) {
        return jsonResponse(
          { error: 'lesson_not_found', message: '指定されたレッスンが見つかりません。' },
          { status: 404 },
          request,
        )
      }

      // Update task_progress: if there's an active plan, update relevant_lesson_ids
      if (body.planId) {
        // Find current in-progress task and update its relevant_lesson_ids
        const { data: tasks } = await client
          .from('task_progress')
          .select('id, task_id, relevant_lesson_ids')
          .eq('plan_id', body.planId)
          .eq('status', 'in-progress')
          .limit(1)

        if (tasks?.[0]) {
          const currentLessonIds = (tasks[0].relevant_lesson_ids as string[]) ?? []
          const updatedLessonIds = currentLessonIds.includes(body.targetLessonId)
            ? currentLessonIds
            : [...currentLessonIds, body.targetLessonId]

          await client
            .from('task_progress')
            .update({
              relevant_lesson_ids: updatedLessonIds,
              updated_at: new Date().toISOString(),
            })
            .eq('id', tasks[0].id)
        }
      }

      // TQ-249 (Auditor C8): also persist to compiled_plans.steps so the
      // plan UI reflects the change without waiting for a full recompile.
      if (body.planId && user?.id) {
        const record = await getCompiledPlanRecord({
          userId: user.id,
          planId: body.planId,
          client,
        })
        if (record) {
          const edit = applyChangeNextLesson(record.plan, {
            targetLessonId: body.targetLessonId,
            targetLessonTitle: body.targetLessonTitle ?? targetLesson.title,
            estimatedMinutes: targetLesson.estimatedMinutes ?? null,
          })
          if (edit.applied) {
            await updateCompiledPlanSteps({
              planId: record.planId,
              userId: user.id,
              plan: edit.plan,
              client,
            })
          }
        }
      }

      // Record the lesson change as mentor memory
      await upsertMentorMemory({
        title: 'メンターによるレッスン変更',
        bullets: [
          `変更種別: 次のレッスンを変更`,
          `変更先: ${body.targetLessonTitle ?? targetLesson.title} (${body.targetLessonId})`,
          ...(body.currentNextLessonId ? [`変更前: ${body.currentNextLessonTitle ?? body.currentNextLessonId}`] : []),
          `理由: ${body.reason}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      // Mark completion on the current lesson if context provided
      if (body.lessonId) {
        await client
          .from('user_progress')
          .upsert({
            user_id: user?.id ?? 'preview',
            lesson_id: body.lessonId,
            completed: true,
            completed_at: new Date().toISOString(),
          }, { onConflict: 'user_id,lesson_id' })
          .then(() => {/* ok */}, () => {/* non-blocking */})
      }

      return jsonResponse({
        data: {
          action: 'change_next_lesson',
          targetLessonId: body.targetLessonId,
          targetLessonTitle: body.targetLessonTitle ?? targetLesson.title,
          success: true,
        },
      }, {}, request)
    }

    case 'skip_lesson': {
      if (!body.targetLessonId) {
        return jsonResponse(
          { error: 'missing_target', message: 'スキップするレッスンIDが必要です。' },
          { status: 400 },
          request,
        )
      }

      // Mark the lesson as skipped in task_progress if plan provided
      if (body.planId) {
        const { data: tasks } = await client
          .from('task_progress')
          .select('id, task_id, relevant_lesson_ids')
          .eq('plan_id', body.planId)

        // Find task whose relevant_lesson_ids contains the target
        const matchingTask = tasks?.find((t) => {
          const ids = (t.relevant_lesson_ids as string[]) ?? []
          return ids.includes(body.targetLessonId!)
        })

        if (matchingTask) {
          await client
            .from('task_progress')
            .update({
              status: 'skipped',
              updated_at: new Date().toISOString(),
            })
            .eq('id', matchingTask.id)
        }
      }

      // TQ-249 (Auditor C8): mark the step as skipped in compiled_plans.steps.
      if (body.planId && user?.id) {
        const record = await getCompiledPlanRecord({
          userId: user.id,
          planId: body.planId,
          client,
        })
        if (record) {
          const edit = applySkipLesson(record.plan, body.targetLessonId)
          if (edit.applied) {
            await updateCompiledPlanSteps({
              planId: record.planId,
              userId: user.id,
              plan: edit.plan,
              client,
            })
          }
        }
      }

      // Record as mentor memory
      await upsertMentorMemory({
        title: 'メンターによるレッスンスキップ',
        bullets: [
          `スキップ対象: ${body.targetLessonTitle ?? body.targetLessonId}`,
          `理由: ${body.reason}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      if (user?.id) {
        const activeCompiledPlan = await getLatestActiveCompiledPlan({
          userId: user.id,
          client,
        })

        await emitTelemetryEvent({
          userId: user.id,
          eventName: 'lesson_skipped',
          planId: activeCompiledPlan?.planId ?? null,
          requestId: getRequestId(request),
          properties: {
            lesson_id: body.targetLessonId,
            lesson_title: body.targetLessonTitle ?? null,
            reason: body.reason,
            source: 'mentor_action',
          },
        })
      }

      return jsonResponse({
        data: {
          action: 'skip_lesson',
          targetLessonId: body.targetLessonId,
          targetLessonTitle: body.targetLessonTitle,
          success: true,
        },
      }, {}, request)
    }

    case 'add_lesson': {
      if (!body.targetLessonId) {
        return jsonResponse(
          { error: 'missing_target', message: '追加するレッスンIDが必要です。' },
          { status: 400 },
          request,
        )
      }

      const targetLesson = await fetchAtomById(body.targetLessonId)
      if (!targetLesson) {
        return jsonResponse(
          { error: 'lesson_not_found', message: '指定されたレッスンが見つかりません。' },
          { status: 404 },
          request,
        )
      }

      // Add lesson to the current plan's active task relevant_lesson_ids
      if (body.planId) {
        const { data: tasks } = await client
          .from('task_progress')
          .select('id, task_id, relevant_lesson_ids')
          .eq('plan_id', body.planId)
          .eq('status', 'in-progress')
          .limit(1)

        if (tasks?.[0]) {
          const currentLessonIds = (tasks[0].relevant_lesson_ids as string[]) ?? []
          if (!currentLessonIds.includes(body.targetLessonId)) {
            // Insert before the specified lesson or at end
            const updatedIds = [...currentLessonIds]
            if (body.beforeLessonId) {
              const idx = updatedIds.indexOf(body.beforeLessonId)
              if (idx >= 0) {
                updatedIds.splice(idx, 0, body.targetLessonId)
              } else {
                updatedIds.push(body.targetLessonId)
              }
            } else {
              updatedIds.push(body.targetLessonId)
            }

            await client
              .from('task_progress')
              .update({
                relevant_lesson_ids: updatedIds,
                updated_at: new Date().toISOString(),
              })
              .eq('id', tasks[0].id)
          }
        }
      }

      // TQ-249 (Auditor C8): also persist to compiled_plans.steps.
      if (body.planId && user?.id) {
        const record = await getCompiledPlanRecord({
          userId: user.id,
          planId: body.planId,
          client,
        })
        if (record) {
          const edit = applyAddLesson(record.plan, {
            targetLessonId: body.targetLessonId,
            targetLessonTitle: body.targetLessonTitle ?? targetLesson.title,
            beforeLessonId: body.beforeLessonId ?? null,
            estimatedMinutes: targetLesson.estimatedMinutes ?? null,
          })
          if (edit.applied) {
            await updateCompiledPlanSteps({
              planId: record.planId,
              userId: user.id,
              plan: edit.plan,
              client,
            })
          }
        }
      }

      // Record as mentor memory
      await upsertMentorMemory({
        title: 'メンターによるレッスン追加',
        bullets: [
          `追加レッスン: ${body.targetLessonTitle ?? targetLesson.title} (${body.targetLessonId})`,
          ...(body.beforeLessonId ? [`挿入位置: ${body.beforeLessonId}の前`] : []),
          `理由: ${body.reason}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      return jsonResponse({
        data: {
          action: 'add_lesson',
          targetLessonId: body.targetLessonId,
          targetLessonTitle: body.targetLessonTitle ?? targetLesson.title,
          success: true,
        },
      }, {}, request)
    }

    case 'reorder_schedule': {
      if (!body.newOrder?.length) {
        return jsonResponse(
          { error: 'missing_order', message: '新しい順序が必要です。' },
          { status: 400 },
          request,
        )
      }

      // Update the active task's relevant_lesson_ids with the new order
      if (body.planId) {
        const { data: tasks } = await client
          .from('task_progress')
          .select('id, task_id, relevant_lesson_ids')
          .eq('plan_id', body.planId)
          .eq('status', 'in-progress')
          .limit(1)

        if (tasks?.[0]) {
          await client
            .from('task_progress')
            .update({
              relevant_lesson_ids: body.newOrder.map((o) => o.lessonId),
              updated_at: new Date().toISOString(),
            })
            .eq('id', tasks[0].id)
        }
      }

      // TQ-249 (Auditor C8): apply the reorder to compiled_plans.steps.
      if (body.planId && user?.id) {
        const record = await getCompiledPlanRecord({
          userId: user.id,
          planId: body.planId,
          client,
        })
        if (record) {
          const edit = applyReorderSchedule(
            record.plan,
            body.newOrder.map((o) => o.lessonId),
          )
          if (edit.applied) {
            await updateCompiledPlanSteps({
              planId: record.planId,
              userId: user.id,
              plan: edit.plan,
              client,
            })
          }
        }
      }

      // Record as mentor memory
      await upsertMentorMemory({
        title: 'メンターによるスケジュール変更',
        bullets: [
          `新しい順序: ${body.newOrder.map((o) => o.lessonTitle).join(' → ')}`,
          `理由: ${body.reason}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      return jsonResponse({
        data: {
          action: 'reorder_schedule',
          newOrder: body.newOrder,
          success: true,
        },
      }, {}, request)
    }

    case 'recompile_plan': {
      const resolvedPlanId = body.planId ?? (user?.id
        ? (await getLatestActiveCompiledPlan({ userId: user.id, client }))?.planId
        : null)

      if (!resolvedPlanId) {
        return jsonResponse(
          { error: 'no_active_plan', message: 'アクティブなプランが見つかりません。' },
          { status: 404 },
          request,
        )
      }

      const trigger: RecompileTrigger = {
        reason: 'manual',
        context: {
          blockedNodeIds: [],
          userMessage: body.reason,
        },
      }

      const result = await recompilePlanWithAI({
        client,
        userId: user?.id ?? 'preview',
        currentPlanId: resolvedPlanId,
        trigger,
        requestId: getRequestId(request),
      })

      if (!result) {
        return jsonResponse(
          { error: 'recompile_failed', message: 'プランの再生成に失敗しました。' },
          { status: 422 },
          request,
        )
      }

      await upsertMentorMemory({
        title: 'メンターによるプラン再生成',
        bullets: [
          `理由: ${body.reason}`,
          `新プランID: ${result.planId}`,
          `追加: ${result.changes.addedNodeIds.length}件, 削除: ${result.changes.removedNodeIds.length}件`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      if (user?.id) {
        await emitTelemetryEvent({
          userId: user.id,
          eventName: 'mentor_action_executed',
          planId: result.planId,
          requestId: getRequestId(request),
          properties: {
            action_type: 'recompile_plan',
            reason: body.reason,
            source: 'mentor_action_card',
          },
        }).catch(() => undefined)
      }

      return jsonResponse({
        data: {
          action: 'recompile_plan',
          planId: result.planId,
          parentPlanId: result.parentPlanId,
          plan: result.newPlan,
          changes: result.changes,
          success: true,
        },
      }, {}, request)
    }

    case 'adjust_difficulty': {
      const direction = body.direction ?? 'easier'
      const resolvedPlanId = body.planId ?? (user?.id
        ? (await getLatestActiveCompiledPlan({ userId: user.id, client }))?.planId
        : null)

      if (!resolvedPlanId) {
        return jsonResponse(
          { error: 'no_active_plan', message: 'アクティブなプランが見つかりません。' },
          { status: 404 },
          request,
        )
      }

      const trigger: RecompileTrigger = {
        reason: 'manual',
        context: {
          blockedNodeIds: [],
          userMessage: `難易度調整: ${direction === 'easier' ? 'より簡単に' : 'より難しく'}。${body.reason}`,
        },
      }

      const result = await recompilePlanWithAI({
        client,
        userId: user?.id ?? 'preview',
        currentPlanId: resolvedPlanId,
        trigger,
        requestId: getRequestId(request),
      })

      if (!result) {
        return jsonResponse(
          { error: 'adjust_failed', message: '難易度調整に失敗しました。' },
          { status: 422 },
          request,
        )
      }

      await upsertMentorMemory({
        title: '難易度調整',
        bullets: [
          `方向: ${direction === 'easier' ? '簡単に' : '難しく'}`,
          `理由: ${body.reason}`,
          `新プランID: ${result.planId}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      if (user?.id) {
        await emitTelemetryEvent({
          userId: user.id,
          eventName: 'mentor_action_executed',
          planId: result.planId,
          requestId: getRequestId(request),
          properties: {
            action_type: 'adjust_difficulty',
            direction,
            reason: body.reason,
            source: 'mentor_action_card',
          },
        }).catch(() => undefined)
      }

      return jsonResponse({
        data: {
          action: 'adjust_difficulty',
          direction,
          planId: result.planId,
          parentPlanId: result.parentPlanId,
          plan: result.newPlan,
          changes: result.changes,
          success: true,
        },
      }, {}, request)
    }

    case 'focus_lesson': {
      const targetId = body.targetLessonId ?? body.lessonId
      if (!targetId) {
        return jsonResponse(
          { error: 'missing_target', message: 'フォーカスするレッスンIDが必要です。' },
          { status: 400 },
          request,
        )
      }

      const targetLesson = await fetchAtomById(targetId)

      await upsertMentorMemory({
        title: 'レッスンフォーカス',
        bullets: [
          `レッスン: ${body.targetLessonTitle ?? targetLesson?.title ?? targetId}`,
          `理由: ${body.reason}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      if (user?.id) {
        await emitTelemetryEvent({
          userId: user.id,
          eventName: 'mentor_action_executed',
          requestId: getRequestId(request),
          properties: {
            action_type: 'focus_lesson',
            target_lesson_id: targetId,
            reason: body.reason,
            source: 'mentor_action_card',
          },
        }).catch(() => undefined)
      }

      return jsonResponse({
        data: {
          action: 'focus_lesson',
          lessonId: targetId,
          lessonTitle: body.targetLessonTitle ?? targetLesson?.title ?? '',
          success: true,
        },
      }, {}, request)
    }

    case 'recommend_tool': {
      // TQ-221: 推薦のみ。plan の step 自体は更新せず、mentor_memory に記録 + telemetry のみ。
      // 学習者が同意して `switch_tool` を踏んだ時点で実反映する設計。
      if (!body.stepId || !body.toolId) {
        return jsonResponse(
          { error: 'missing_target', message: 'stepId と toolId が必要です。' },
          { status: 400 },
          request,
        )
      }
      if (!isKnownAiToolId(body.toolId)) {
        return jsonResponse(
          { error: 'unknown_tool', message: '指定されたAIツールはカタログに存在しません。' },
          { status: 400 },
          request,
        )
      }

      const tool = getAiToolById(body.toolId)
      const toolLabel = body.toolLabel ?? tool?.label ?? body.toolId

      await upsertMentorMemory({
        title: 'AIツール推薦',
        bullets: [
          `対象ステップ: ${body.stepId}`,
          `推薦ツール: ${toolLabel} (${body.toolId})`,
          `理由: ${body.reason}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      if (user?.id) {
        await emitTelemetryEvent({
          userId: user.id,
          eventName: 'mentor_action_executed',
          planId: body.planId ?? null,
          requestId: getRequestId(request),
          properties: {
            action_type: 'recommend_tool',
            step_id: body.stepId,
            tool_id: body.toolId,
            reason: body.reason,
            source: 'mentor_action_card',
          },
        }).catch(() => undefined)
      }

      return jsonResponse({
        data: {
          action: 'recommend_tool',
          stepId: body.stepId,
          toolId: body.toolId,
          toolLabel,
          success: true,
        },
      }, {}, request)
    }

    case 'delegate_to_tool': {
      // TQ-221: 推薦を一歩進めて「ツールに渡す brief」も含めて記録する。
      // 実際のツール起動は UI 側 (AiToolLaunchCard) が brief をクリップボードにコピー
      // する想定。ここでは brief を mentor_memory に durable に保存する。
      if (!body.stepId || !body.toolId || !body.delegationBrief) {
        return jsonResponse(
          { error: 'missing_target', message: 'stepId / toolId / delegationBrief が必要です。' },
          { status: 400 },
          request,
        )
      }
      if (!isKnownAiToolId(body.toolId)) {
        return jsonResponse(
          { error: 'unknown_tool', message: '指定されたAIツールはカタログに存在しません。' },
          { status: 400 },
          request,
        )
      }

      const tool = getAiToolById(body.toolId)
      const toolLabel = body.toolLabel ?? tool?.label ?? body.toolId

      await upsertMentorMemory({
        title: 'AIツールへの委譲',
        bullets: [
          `対象ステップ: ${body.stepId}`,
          `委譲先: ${toolLabel} (${body.toolId})`,
          `依頼文: ${body.delegationBrief}`,
          `理由: ${body.reason}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      if (user?.id) {
        await emitTelemetryEvent({
          userId: user.id,
          eventName: 'mentor_action_executed',
          planId: body.planId ?? null,
          requestId: getRequestId(request),
          properties: {
            action_type: 'delegate_to_tool',
            step_id: body.stepId,
            tool_id: body.toolId,
            reason: body.reason,
            source: 'mentor_action_card',
          },
        }).catch(() => undefined)
      }

      return jsonResponse({
        data: {
          action: 'delegate_to_tool',
          stepId: body.stepId,
          toolId: body.toolId,
          toolLabel,
          delegationBrief: body.delegationBrief,
          success: true,
        },
      }, {}, request)
    }

    case 'switch_tool': {
      // TQ-221 / TQ-256 (Auditor C9): 該当 step に紐づくツールを別のツールへ切り替える。
      // 例: 「v0 でやってみたい」→ recommended_tool が claude-code から v0 へ更新される。
      // TQ-220 で compiled_plans.steps[].recommended_tool 列が正式に追加されたため、
      // mentor_memory + telemetry に加えて compiled_plans を直接 update する。
      if (!body.stepId || !body.toToolId) {
        return jsonResponse(
          { error: 'missing_target', message: 'stepId と toToolId が必要です。' },
          { status: 400 },
          request,
        )
      }
      if (!isKnownAiToolId(body.toToolId)) {
        return jsonResponse(
          { error: 'unknown_tool', message: '切替先のAIツールがカタログに存在しません。' },
          { status: 400 },
          request,
        )
      }
      if (body.fromToolId && !isKnownAiToolId(body.fromToolId)) {
        return jsonResponse(
          { error: 'unknown_tool', message: '切替元のAIツールがカタログに存在しません。' },
          { status: 400 },
          request,
        )
      }

      const toTool = getAiToolById(body.toToolId)
      const toToolLabel = body.toToolLabel ?? toTool?.label ?? body.toToolId
      const fromTool = body.fromToolId ? getAiToolById(body.fromToolId) : null
      const fromToolLabel = body.fromToolId
        ? (fromTool?.label ?? body.fromToolId)
        : '(未指定)'

      // TQ-256 (Auditor C9): write the new recommended_tool to compiled_plans.
      if (body.planId && user?.id) {
        const record = await getCompiledPlanRecord({
          userId: user.id,
          planId: body.planId,
          client,
        })
        if (record) {
          const edit = applySwitchTool(record.plan, {
            stepId: body.stepId,
            toToolId: body.toToolId,
            fromToolId: body.fromToolId ?? null,
          })
          if (edit.applied) {
            await updateCompiledPlanSteps({
              planId: record.planId,
              userId: user.id,
              plan: edit.plan,
              client,
            })
          }
        }
      }

      await upsertMentorMemory({
        title: 'AIツール切替',
        bullets: [
          `対象ステップ: ${body.stepId}`,
          `切替元: ${fromToolLabel}`,
          `切替先: ${toToolLabel} (${body.toToolId})`,
          `理由: ${body.reason}`,
        ],
        source: 'mentor',
      }, client).catch(() => {/* non-blocking */})

      if (user?.id) {
        await emitTelemetryEvent({
          userId: user.id,
          eventName: 'mentor_action_executed',
          planId: body.planId ?? null,
          requestId: getRequestId(request),
          properties: {
            action_type: 'switch_tool',
            step_id: body.stepId,
            from_tool_id: body.fromToolId ?? null,
            to_tool_id: body.toToolId,
            reason: body.reason,
            source: 'mentor_action_card',
          },
        }).catch(() => undefined)
      }

      return jsonResponse({
        data: {
          action: 'switch_tool',
          stepId: body.stepId,
          fromToolId: body.fromToolId ?? null,
          toToolId: body.toToolId,
          toToolLabel,
          success: true,
        },
      }, {}, request)
    }

    default:
      return jsonResponse(
        { error: 'unknown_action', message: '不明なアクションタイプです。' },
        { status: 400 },
        request,
      )
  }
}
