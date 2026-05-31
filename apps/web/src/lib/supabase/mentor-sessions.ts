import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type {
  MentorSessionPhase,
  MentorSessionState,
  MentorSessionTransport,
  PlannerConversationMessage,
  PlannerHearingAnswers,
  PlannerHearingInsights,
} from '@/lib/planner/types'
import { sanitizeHearingInsights } from '@/lib/planner/hearing'
import { buildMentorCanonicalGoalKey } from '@/lib/mentor/session-key'

type Client = SupabaseClient<Database>
type SessionRow = Database['public']['Tables']['mentor_sessions']['Row']
type SessionInsert = Database['public']['Tables']['mentor_sessions']['Insert']

const DEFAULT_TRANSPORT: MentorSessionTransport = {
  status: 'live',
  label: 'AIメンター',
  message: 'Unified mentor session',
}

export function createEmptyMentorSession(goal: string): MentorSessionState {
  return {
    id: null,
    goal,
    canonicalGoalKey: buildMentorCanonicalGoalKey(goal),
    messages: [],
    historySummary: null,
    phase: 'discovering',
    answers: {},
    insights: sanitizeHearingInsights(),
    lastQuestionId: null,
    transport: DEFAULT_TRANSPORT,
    completedAt: null,
    summaryKeyPoints: [],
    personaIds: [],
    activePlanId: null,
    currentLessonId: null,
    createdAt: null,
    updatedAt: null,
  }
}

function normalizeMessages(value: unknown): PlannerConversationMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const candidate = entry as Record<string, unknown>
      const role =
        candidate.role === 'assistant' || candidate.role === 'user'
          ? candidate.role
          : null
      const content = typeof candidate.content === 'string' ? candidate.content.trim() : ''

      if (!role || !content) {
        return null
      }

      return {
        id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `mentor-session-message-${index}`,
        role,
        content,
      } satisfies PlannerConversationMessage
    })
    .filter((entry): entry is PlannerConversationMessage => entry !== null)
}

function normalizeAnswers(value: unknown): Partial<PlannerHearingAnswers> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as Partial<PlannerHearingAnswers>
}

function normalizePhase(value: unknown): MentorSessionPhase {
  switch (value) {
    case 'discovering':
    case 'clarifying_goal':
    case 'ready_to_plan':
    case 'planning':
    case 'coaching':
    case 'executing':
    case 'stuck':
    case 'reviewing':
      return value
    default:
      return 'discovering'
  }
}

function normalizeTransport(value: unknown): MentorSessionTransport {
  if (!value || typeof value !== 'object') {
    return DEFAULT_TRANSPORT
  }

  const candidate = value as Record<string, unknown>
  const status =
    candidate.status === 'live' || candidate.status === 'unavailable' || candidate.status === 'error'
      ? candidate.status
      : DEFAULT_TRANSPORT.status

  return {
    status,
    label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : DEFAULT_TRANSPORT.label,
    message: typeof candidate.message === 'string' && candidate.message.trim() ? candidate.message.trim() : DEFAULT_TRANSPORT.message,
    model: typeof candidate.model === 'string' && candidate.model.trim() ? candidate.model.trim() : undefined,
    endpoint: typeof candidate.endpoint === 'string' && candidate.endpoint.trim() ? candidate.endpoint.trim() : undefined,
  }
}

function rowToSession(row: SessionRow): MentorSessionState {
  return {
    id: row.id,
    goal: row.goal,
    canonicalGoalKey: row.canonical_goal_key,
    messages: normalizeMessages(row.messages),
    historySummary: row.history_summary,
    phase: normalizePhase(row.phase),
    answers: normalizeAnswers(row.hearing_answers),
    insights: sanitizeHearingInsights((row.hearing_insights as Record<string, unknown> | null) ?? undefined),
    lastQuestionId: null,
    transport: DEFAULT_TRANSPORT,
    completedAt: row.completed_at,
    summaryKeyPoints: row.summary_key_points ?? [],
    personaIds: row.persona_ids ?? [],
    activePlanId: row.active_plan_id,
    currentLessonId: row.current_lesson_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function sessionToRow(session: MentorSessionState, userId: string): SessionInsert {
  return {
    id: session.id ?? undefined,
    user_id: userId,
    goal: session.goal,
    canonical_goal_key: session.canonicalGoalKey || buildMentorCanonicalGoalKey(session.goal),
    messages: JSON.parse(JSON.stringify(session.messages)),
    history_summary: session.historySummary ?? null,
    phase: session.phase,
    hearing_answers: JSON.parse(JSON.stringify(session.answers ?? {})),
    hearing_insights: JSON.parse(JSON.stringify(session.insights ?? {})),
    summary_key_points: session.summaryKeyPoints ?? [],
    persona_ids: session.personaIds ?? [],
    active_plan_id: session.activePlanId ?? null,
    current_lesson_id: session.currentLessonId ?? null,
    completed_at: session.completedAt ?? null,
    updated_at: new Date().toISOString(),
  }
}

export async function getMentorSessionByGoal(
  client: Client,
  userId: string,
  goal: string,
): Promise<MentorSessionState | null> {
  const canonicalGoalKey = buildMentorCanonicalGoalKey(goal)
  const { data, error } = await client
    .from('mentor_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('canonical_goal_key', canonicalGoalKey)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return rowToSession(data)
}

export async function getMentorSessionById(
  client: Client,
  userId: string,
  sessionId: string,
): Promise<MentorSessionState | null> {
  const { data, error } = await client
    .from('mentor_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return rowToSession(data)
}

export async function upsertMentorSession(
  client: Client,
  userId: string,
  session: MentorSessionState,
): Promise<MentorSessionState> {
  const payload = sessionToRow(
    {
      ...session,
      canonicalGoalKey: session.canonicalGoalKey || buildMentorCanonicalGoalKey(session.goal),
    },
    userId,
  )

  const { data, error } = await client
    .from('mentor_sessions')
    .upsert(payload, { onConflict: 'user_id,canonical_goal_key' })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'mentor session upsert failed')
  }

  return rowToSession(data)
}

export async function resetMentorSession(
  client: Client,
  userId: string,
  goal: string,
): Promise<void> {
  const canonicalGoalKey = buildMentorCanonicalGoalKey(goal)
  const { error } = await client
    .from('mentor_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('canonical_goal_key', canonicalGoalKey)

  if (error) {
    throw new Error(error.message)
  }
}
