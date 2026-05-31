import { fetchAtomById } from '@/lib/atoms/atom-repository'
import { toAtomViewModel } from '@/lib/atoms/atom-view-model'
import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { getLearnerState, getMentorMemories } from '@/lib/learner-models'
import {
  buildSuggestedQuestions,
  type SuggestedQuestionLessonContext,
} from '@/lib/mentor/suggested-questions'
import { createClient } from '@/lib/supabase/server'
import type { MentorMemory } from '@/types'

export const dynamic = 'force-dynamic'

function collectMemoryBullets(memories: MentorMemory[]): string[] {
  return memories.flatMap((memory) => {
    const bullets = (memory.bullets ?? []).filter((bullet) => bullet.trim().length > 0)
    if (bullets.length > 0) {
      return bullets
    }

    return memory.title.trim() ? [memory.title] : []
  })
}

async function resolveLessonContext(lessonId: string | null): Promise<SuggestedQuestionLessonContext | null> {
  if (!lessonId) {
    return null
  }

  try {
    const atom = await fetchAtomById(lessonId)
    if (!atom) {
      return null
    }

    const lesson = toAtomViewModel(atom)
    return {
      id: lesson.atomId,
      title: lesson.title,
      summary: lesson.summary,
    }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'mentor-chat:suggested-questions', RL_READ)
  if (rlResponse) {
    return rlResponse
  }

  const url = new URL(request.url)
  const lessonId = url.searchParams.get('lessonId')
  const goalText = url.searchParams.get('goalText')
  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  const [lessonContext, learnerStateResult, mentorMemoriesResult] = await Promise.all([
    resolveLessonContext(lessonId),
    user ? getLearnerState(client) : Promise.resolve({ data: null, error: null }),
    user ? getMentorMemories(5, client) : Promise.resolve({ data: [], error: null }),
  ])

  const questions = buildSuggestedQuestions({
    lessonContext,
    blockers: learnerStateResult.data?.blockers ?? [],
    memoryBullets: collectMemoryBullets(mentorMemoriesResult.data ?? []),
    goalText,
  })

  return jsonResponse(
    {
      questions,
    },
    { headers: { 'Cache-Control': 'no-store' } },
    request,
  )
}
