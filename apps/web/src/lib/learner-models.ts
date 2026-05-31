import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getSupabase } from '@/lib/supabase/client'
import type { PlannerContinuationStep, PlannerCurrentTask, PlannerLessonReference } from '@/lib/planner/types'
import type {
  ApiResponse,
  LearnerProfile,
  LearnerProfileInput,
  PlannerArtifact,
  PlannerArtifactInput,
  LearnerState,
  LearnerStateInput,
  LessonFeedback,
  MentorMemory,
  MentorMemoryInput,
} from '@/types'
import { compactMentorMemories } from '@/lib/mentor-memory-compaction'

type LearnerModelClient = SupabaseClient<Database>

interface SyncCompletedPlannerTaskInput {
  goal: string
  trackId?: string | null
  step: PlannerContinuationStep
  currentTask: PlannerCurrentTask
  relevantLessons: PlannerLessonReference[]
  nextStep?: PlannerContinuationStep | null
}

async function resolveUserId(client: LearnerModelClient) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error) {
    throw new Error(error.message)
  }

  if (!user) {
    throw new Error('認証ユーザーが見つかりません')
  }

  return user.id
}

function createErrorResponse<T>(error: unknown): ApiResponse<T> {
  if (error instanceof Error) {
    return { data: null, error: error.message }
  }

  return { data: null, error: '不明なエラーが発生しました' }
}

export async function getLearnerProfile(
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<LearnerProfile>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('learner_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      throw error
    }

    return { data: (data as LearnerProfile | null) ?? null, error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function upsertLearnerProfile(
  input: LearnerProfileInput,
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<LearnerProfile>> {
  try {
    const userId = await resolveUserId(client)
    const updatedAt = new Date().toISOString()
    const { data, error } = await client
      .from('learner_profile')
      .upsert({ user_id: userId, ...input, updated_at: updatedAt }, { onConflict: 'user_id' })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return { data: data as LearnerProfile, error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function getLearnerState(
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<LearnerState>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('learner_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      throw error
    }

    return { data: (data as LearnerState | null) ?? null, error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function upsertLearnerState(
  input: LearnerStateInput,
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<LearnerState>> {
  try {
    const userId = await resolveUserId(client)
    const updatedAt = new Date().toISOString()
    const payload: Database['public']['Tables']['learner_state']['Insert'] = {
      user_id: userId,
      ...input,
      signals: input.signals as Database['public']['Tables']['learner_state']['Insert']['signals'],
      updated_at: updatedAt,
    }
    const { data, error } = await client
      .from('learner_state')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return { data: data as LearnerState, error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function getMentorMemory(
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<MentorMemory>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('mentor_memory')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw error
    }

    return { data: (data as MentorMemory | null) ?? null, error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function getMentorMemories(
  limit = 10,
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<MentorMemory[]>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('mentor_memory')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw error
    }

    return { data: (data as MentorMemory[] | null) ?? [], error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function getLessonFeedbackSummary(
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<LessonFeedback[]>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('lesson_feedback')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      throw error
    }

    return { data: (data as LessonFeedback[] | null) ?? [], error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function upsertMentorMemory(
  input: MentorMemoryInput,
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<MentorMemory>> {
  try {
    const userId = await resolveUserId(client)
    const { data, error } = await client
      .from('mentor_memory')
      .insert({
        user_id: userId,
        bullets: [],
        source: 'planner',
        ...input,
      })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    // 圧縮トリガー: 挿入後に非同期でカウントチェック→compaction実行
    const insertedUserId = (data as MentorMemory).user_id
    compactMentorMemories(insertedUserId, client).catch(() => {
      /* non-blocking: compaction failure should not affect normal flow */
    })

    return { data: data as MentorMemory, error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function syncCompletedPlannerTask(
  input: SyncCompletedPlannerTaskInput,
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<{ learnerState: LearnerState | null; mentorMemory: MentorMemory | null }>> {
  try {
    const lessonTitles = input.relevantLessons.slice(0, 3).map((lesson) => lesson.title)
    const learnerStateResult = await upsertLearnerState(
      {
        active_track_id: input.trackId ?? null,
        active_task_id: input.nextStep?.id ?? null,
        target_outcome: input.nextStep?.outcome ?? input.currentTask.outcome,
      },
      client
    )

    if (learnerStateResult.error) {
      throw new Error(learnerStateResult.error)
    }

    const mentorMemoryResult = await upsertMentorMemory(
      {
        track_id: input.trackId ?? null,
        task_id: input.step.id,
        title: `${input.step.title} を完了`,
        bullets: [
          `goal: ${input.goal}`,
          `Do: ${input.currentTask.do}`,
          `Learn: ${input.currentTask.learn}`,
          `Why: ${input.currentTask.why}`,
          lessonTitles.length > 0 ? `関連 lesson: ${lessonTitles.join(' / ')}` : '関連 lesson は未選択でした。',
          input.nextStep ? `次の task: ${input.nextStep.title}` : '現在のプランの最後の task まで完了しました。',
        ],
        source: 'planner',
      },
      client
    )

    if (mentorMemoryResult.error) {
      throw new Error(mentorMemoryResult.error)
    }

    return {
      data: {
        learnerState: learnerStateResult.data,
        mentorMemory: mentorMemoryResult.data,
      },
      error: null,
    }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function getPlannerArtifacts(
  filters: {
    plannerGoal?: string | null
    trackId?: string | null
  } = {},
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<PlannerArtifact[]>> {
  try {
    const userId = await resolveUserId(client)
    let query = client
      .from('artifacts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (filters.plannerGoal) {
      query = query.eq('planner_goal', filters.plannerGoal)
    }

    if (filters.trackId) {
      query = query.eq('track_id', filters.trackId)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return { data: (data as PlannerArtifact[] | null) ?? [], error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}

export async function createPlannerArtifact(
  input: PlannerArtifactInput,
  client: LearnerModelClient = getSupabase()
): Promise<ApiResponse<PlannerArtifact>> {
  try {
    const userId = await resolveUserId(client)
    const timestamp = new Date().toISOString()
    const { data, error } = await client
      .from('artifacts')
      .insert({
        user_id: userId,
        ...input,
        updated_at: timestamp,
      })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return { data: data as PlannerArtifact, error: null }
  } catch (error) {
    return createErrorResponse(error)
  }
}
