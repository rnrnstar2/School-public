import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_AI } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { resolveLessonIdentityId } from '@/lib/supabase/lesson-catalog'
import { getCompiledPlanRecord } from '@/lib/compiled-plans'
import { fetchAtomById } from '@/lib/atoms/atom-repository'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'lesson-recommend-next', RL_AI)
  if (rlResponse) return rlResponse

  const { id } = await params
  const lessonId = id?.trim()

  if (!lessonId) {
    return jsonResponse({ error: 'lesson_id は必須です。' }, { status: 400 }, request)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const resolvedLessonIdResult = await resolveLessonIdentityId({
    client: supabase,
    lessonIdOrSlug: lessonId,
  })
  const canonicalLessonId = resolvedLessonIdResult.data ?? lessonId

  try {
    const activePlan = await getCompiledPlanRecord({
      userId: user.id,
      status: 'active',
      client: supabase,
    })

    if (activePlan?.plan.steps.length) {
      const currentIdx = activePlan.plan.steps.findIndex((step) => step.atomId === canonicalLessonId)
      const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0
      const nextStep = activePlan.plan.steps
        .slice(startIdx)
        .find((step) => !step.completedAt)

      if (nextStep?.atomId) {
        const nextAtom = await fetchAtomById(nextStep.atomId)

        if (nextAtom) {
          return jsonResponse({
            recommendation: {
              id: nextAtom.atomId,
              title: nextAtom.title,
              summary: nextStep.rationale || '',
              branchLabel: null,
            },
            reasoning: 'アクティブな atom plan の次のステップとして推薦されています。',
            allChoices: [],
          }, {}, request)
        }
      }
    }
  } catch {
    // Plan resolution failed.
  }

  return jsonResponse({ recommendation: null, reasoning: null, allChoices: [] }, {}, request)
}
