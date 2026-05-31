import { z } from 'zod/v4'

// ── Shared primitives ──────────────────────────────────────────────
const trimmedString = (max = 2000) => z.string().max(max).transform((s) => s.trim())
const optionalTrimmed = (max = 2000) => trimmedString(max).optional()

// ── /api/artifacts POST ────────────────────────────────────────────
export const artifactCreateSchema = z.object({
  task_id: trimmedString(),
  type: z.enum(['url', 'text', 'note']),
  body: trimmedString(10_000),
  title: optionalTrimmed().nullable(),
  planner_goal: optionalTrimmed().nullable(),
  track_id: optionalTrimmed().nullable(),
  milestone_id: optionalTrimmed().nullable(),
  milestone_title: optionalTrimmed().nullable(),
  step_title: optionalTrimmed().nullable(),
})
export type ArtifactCreateInput = z.infer<typeof artifactCreateSchema>

// ── /api/artifacts/verify POST ─────────────────────────────────────
export const artifactVerifySchema = z.object({
  milestone_id: trimmedString(),
  milestone_title: optionalTrimmed(),
  evidence_rule: trimmedString(5000),
  plan_id: optionalTrimmed(),
  artifacts: z.array(z.object({
    artifact_type: z.enum(['url', 'text', 'note']),
    title: z.string().max(500).nullable(),
    content: z.string().max(10_000),
  })).max(50).default([]),
  milestones: z.array(z.object({
    id: z.string().max(200),
    title: z.string().max(500),
  })).max(100).optional(),
})
export type ArtifactVerifyInput = z.infer<typeof artifactVerifySchema>

// ── /api/evidence/submit POST ─────────────────────────────────────
export const evidenceSubmitSchema = z.object({
  lessonSlug: trimmedString(200),
  planNodeId: optionalTrimmed(200),
  type: trimmedString(50),
  content: trimmedString(10000),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type EvidenceSubmitInput = z.infer<typeof evidenceSubmitSchema>

// ── /api/evidence/assess POST ─────────────────────────────────────
export const evidenceAssessSchema = z.object({
  evidenceId: trimmedString(200),
  capabilitySlug: trimmedString(200),
  capabilityDomainId: optionalTrimmed(200),
  capabilityDomainSlug: optionalTrimmed(100),
})
export type EvidenceAssessInput = z.infer<typeof evidenceAssessSchema>

// ── /api/planner/hearing POST ──────────────────────────────────────
export const hearingSchema = z.object({
  goal: optionalTrimmed(500),
  answer: z.string().max(5000).nullable().optional(),
  session: z.object({
    answers: z.record(z.string(), z.unknown()).optional(),
    insights: z.record(z.string(), z.unknown()).optional(),
    messages: z.array(z.object({
      role: z.string().max(20),
      content: z.string().max(10_000),
    })).max(50).optional(),
    lastQuestionId: z.string().max(200).nullable().optional(),
    transport: z.record(z.string(), z.unknown()).optional(),
    completedAt: z.string().max(100).nullable().optional(),
    summaryKeyPoints: z.array(z.string().max(500)).max(20).optional(),
    personaIds: z.array(z.string().max(200)).max(10).optional(),
  }).nullable().optional(),
})
export type HearingInput = z.infer<typeof hearingSchema>

// ── /api/mentor/session POST ───────────────────────────────────────
export const mentorSessionSchema = z.object({
  goal: trimmedString(500),
  message: z.string().max(10_000).nullable().optional(),
  sessionId: z.string().max(200).nullable().optional(),
  lesson: z.object({
    id: z.string().max(200),
    title: z.string().max(500),
    summary: z.string().max(2000).optional(),
  }).optional(),
  uiContext: z.object({
    surface: z.string().max(100).optional(),
  }).optional(),
})
export type MentorSessionInput = z.infer<typeof mentorSessionSchema>

// ── /api/planner/recommendation POST ───────────────────────────────
export const recommendationSchema = z.object({
  goal: optionalTrimmed(500),
  hearing: z.record(z.string(), z.unknown()).optional(),
  hearingInsights: z.record(z.string(), z.unknown()).optional(),
})
export type RecommendationInput = z.infer<typeof recommendationSchema>

// ── /api/planner/plan-review POST ──────────────────────────────────
export const planReviewSchema = z.object({
  goal: z.string().max(500),
  continuation: z.object({
    steps: z.array(z.object({
      id: z.string().max(200),
      title: z.string().max(500),
      description: z.string().max(5000),
      outcome: z.string().max(2000).optional(),
      purpose: z.string().max(2000).optional(),
    })).max(100),
  }),
  taskProgress: z.record(z.string(), z.object({
    status: z.string().max(50),
    do: z.string().max(5000).optional(),
    learn: z.string().max(5000).optional(),
    why: z.string().max(5000).optional(),
  })).optional().default({}),
  triggerReasons: z.array(z.object({
    type: z.string().max(100),
    detail: z.string().max(2000),
  })).max(20).optional().default([]),
}).passthrough()
export type PlanReviewInput = z.infer<typeof planReviewSchema>

// ── /api/planner/task-progress POST ────────────────────────────────
const validStatuses = ['not-started', 'in-progress', 'completed', 'on-hold', 'blocked', 'skipped'] as const
export const taskProgressSchema = z.object({
  planId: trimmedString(),
  taskId: trimmedString(),
  status: z.enum(validStatuses).optional().default('not-started'),
  title: z.string().max(500).nullable().optional(),
  doText: z.string().max(5000).nullable().optional(),
  learnText: z.string().max(5000).nullable().optional(),
  whyText: z.string().max(5000).nullable().optional(),
  relevantLessonIds: z.array(z.string().max(200)).max(50).optional(),
})
export type TaskProgressInput = z.infer<typeof taskProgressSchema>

// ── /api/planner/goal-history POST ─────────────────────────────────
export const goalHistoryCreateSchema = z.object({
  goal: trimmedString(500),
  plan_id: z.string().max(200).nullable().optional(),
})
export type GoalHistoryCreateInput = z.infer<typeof goalHistoryCreateSchema>

// ── /api/planner/goal-history PUT ──────────────────────────────────
export const goalHistorySwitchSchema = z.object({
  goalHistoryId: trimmedString(),
})
export type GoalHistorySwitchInput = z.infer<typeof goalHistorySwitchSchema>

// ── /api/planner/graduation POST ───────────────────────────────────
export const graduationSchema = z.object({
  plan_id: trimmedString(),
  track_id: optionalTrimmed(),
  milestones: z.array(z.object({
    id: z.string().max(200),
    title: z.string().max(500),
  }).passthrough()).max(100).optional().default([]),
})
export type GraduationInput = z.infer<typeof graduationSchema>

// ── /api/planner/graduation POST (gate decision mode) ──────────────
// TQ-251 / TQ-252: 動的卒業ゲート選択の永続化リクエスト。
// `mode: 'gate_decision'` のとき本スキーマに従い decision を graduation_decisions
// に upsert する (route 側で mode 判別)。
export const graduationGateDecisionSchema = z.object({
  mode: z.literal('gate_decision'),
  persona_slug: optionalTrimmed().nullable(),
  goal_slug: optionalTrimmed().nullable(),
  plan_id: optionalTrimmed().nullable(),
  decision: z.object({
    kind: z.string().max(80),
    label: z.string().max(200),
    artifact_value: z.string().max(2000),
    explanation: z.string().max(5000).optional().nullable(),
  }),
})
export type GraduationGateDecisionInput = z.infer<typeof graduationGateDecisionSchema>

// ── /api/planner/graduation POST (evidence-based check, 既存) ──────
// 既存呼び出し互換: `mode` が無い (or "evidence_check") なら従来の
// evidence-based graduation 判定を行う。`plan_id` 必須。
export const graduationEvidenceCheckSchema = z.object({
  mode: z.literal('evidence_check').optional(),
  plan_id: trimmedString(),
  track_id: optionalTrimmed(),
  milestones: z.array(z.object({
    id: z.string().max(200),
    title: z.string().max(500),
  }).passthrough()).max(100).optional().default([]),
})
export type GraduationEvidenceCheckInput = z.infer<typeof graduationEvidenceCheckSchema>

/** 両 mode を受け付ける discriminated union. mode が省略されたら evidence_check 互換。 */
export const graduationRequestSchema = z.union([
  graduationGateDecisionSchema,
  graduationEvidenceCheckSchema,
])
export type GraduationRequestInput = z.infer<typeof graduationRequestSchema>

// ── /api/lessons/[id]/chat POST ────────────────────────────────────
export const lessonChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['assistant', 'user']),
    content: z.string().max(10_000),
  })).min(1).max(50),
  lessonTitle: z.string().max(500).optional(),
  lessonSummary: z.string().max(5000).optional(),
  lessonContext: z.string().max(5000).optional(),
})
export type LessonChatInput = z.infer<typeof lessonChatSchema>

// ── /api/lessons/[id]/chat/summary POST ────────────────────────────
export const lessonSummarySchema = z.object({
  lessonTitle: z.string().max(500).optional(),
})
export type LessonSummaryInput = z.infer<typeof lessonSummarySchema>

// ── /api/lessons/[id]/feedback POST ────────────────────────────────
export const lessonFeedbackSchema = z.object({
  difficulty_rating: z.number().int().min(1).max(5),
  clarity_rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
  lessonTitle: z.string().max(500).optional(),
})
export type LessonFeedbackInput = z.infer<typeof lessonFeedbackSchema>

// ── /api/certificate POST ──────────────────────────────────────────
export const certificateIssueSchema = z.object({
  plan_id: trimmedString(),
  track_id: optionalTrimmed(),
  goal_summary: trimmedString(500),
  plan_title: optionalTrimmed(500).nullable(),
  completed_at: trimmedString(100),
  milestone_count: z.number().int().min(0).max(1000),
  criteria_labels: z.array(z.string().max(500)).max(50),
  artifact_urls: z.array(z.string().max(2000)).max(100).optional().default([]),
  ai_tools_used: z.array(z.string().max(200)).max(50).optional().default([]),
})
export type CertificateIssueInput = z.infer<typeof certificateIssueSchema>

// ── /api/planner/plan-revision POST ─────────────────────────────────
export const planRevisionSchema = z.object({
  planId: trimmedString(),
  goal: trimmedString(500),
  title: trimmedString(500),
  summary: trimmedString(5000),
  revisedSteps: z.array(z.object({
    id: z.string().max(200),
    title: z.string().max(500),
    description: z.string().max(5000),
    outcome: z.string().max(2000).optional().default(''),
    purpose: z.string().max(2000).optional().default(''),
    isNew: z.boolean(),
    originalStepId: z.string().max(200).optional(),
  })).max(100),
  removedStepIds: z.array(z.string().max(200)).max(100).default([]),
  revisionSummary: trimmedString(2000),
  revisionRationale: trimmedString(5000),
})
export type PlanRevisionInput = z.infer<typeof planRevisionSchema>

// ── /api/planner/next-goals POST ──────────────────────────────────
export const nextGoalsSchema = z.object({
  track_id: trimmedString(200).optional(),
  goal_summary: trimmedString(500).optional(),
})
export type NextGoalsInput = z.infer<typeof nextGoalsSchema>

// ── /api/goals/[goalId]/next-question POST ────────────────────────
const requiredTrimmedString = (max = 2000) =>
  z.string().max(max).transform((s) => s.trim()).refine((s) => s.length > 0)

const optionalTrimmedToUndefined = (max = 2000) =>
  z.string().max(max).transform((s) => s.trim()).optional().transform((s) =>
    s && s.length > 0 ? s : undefined,
  )

const nextQuestionChoiceSchema = requiredTrimmedString(120)

export const NextQuestionOutputSchema = z.object({
  question: requiredTrimmedString(300),
  choices: z.array(nextQuestionChoiceSchema).min(2).max(4),
  freeform_hint: optionalTrimmedToUndefined(240),
})
export type NextQuestionOutput = z.infer<typeof NextQuestionOutputSchema>

export const nextQuestionRequestSchema = z.object({
  lastAnswer: optionalTrimmedToUndefined(2000),
})
export type NextQuestionRequestInput = z.infer<typeof nextQuestionRequestSchema>

export const nextQuestionAnswerSchema = z.object({
  questionText: requiredTrimmedString(300),
  answer: requiredTrimmedString(2000),
  answerKind: z.enum(['choice', 'freeform']).optional(),
})
export type NextQuestionAnswerInput = z.infer<typeof nextQuestionAnswerSchema>

// ── /api/feedback/ai-response POST ────────────────────────────────
export const aiResponseFeedbackSchema = z.object({
  chat_context: z.enum(['lesson', 'hearing', 'mentor']),
  context_id: z.string().max(500).nullable().optional(),
  message_id: z.string().max(200),
  rating: z.enum(['positive', 'negative']),
  reason: z.enum(['off_topic', 'already_known', 'unclear', 'too_simple', 'too_complex', 'repetitive', 'other']).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
  assistant_message_preview: z.string().max(300).nullable().optional(),
})
export type AiResponseFeedbackApiInput = z.infer<typeof aiResponseFeedbackSchema>

// ── /api/lessons/[id]/context-bridge POST ─────────────────────────
export const contextBridgeSchema = z.object({
  taskId: trimmedString(200),
  taskTitle: trimmedString(500),
  taskDo: trimmedString(5000).optional(),
  taskLearn: trimmedString(5000).optional(),
  taskWhy: trimmedString(5000).optional(),
  goal: trimmedString(500).optional(),
  milestoneId: trimmedString(200).optional(),
  milestoneTitle: trimmedString(500).optional(),
})
export type ContextBridgeInput = z.infer<typeof contextBridgeSchema>

// ── /api/planner/mentor-chat POST ──────────────────────────────────
export const mentorChatSchema = z.object({
  goal: trimmedString(500),
  messages: z.array(z.object({
    role: z.enum(['assistant', 'user']),
    content: z.string().max(10_000),
  })).min(1).max(50),
  context: z.object({
    selectedStepId: z.string().max(200).nullable().optional(),
    continuation: z.object({
      steps: z.array(z.object({
        id: z.string().max(200),
        title: z.string().max(500),
        description: z.string().max(5000).optional(),
      })).max(100),
    }).optional(),
  }).optional(),
  lesson: z.object({
    id: z.string().max(200),
    title: z.string().max(500),
    summary: z.string().max(2000).optional(),
  }).optional(),
})
export type MentorChatInput = z.infer<typeof mentorChatSchema>

// ── /api/vitals POST ───────────────────────────────────────────────
export const vitalsSchema = z.object({
  name: z.string().max(100),
  value: z.number(),
  rating: z.string().max(50).optional(),
}).passthrough()
export type VitalsInput = z.infer<typeof vitalsSchema>

// ── /api/mentor/actions POST ────────────────────────────────────────
const mentorActionType = z.enum([
  'change_next_lesson', 'skip_lesson', 'add_lesson', 'reorder_schedule',
  'recompile_plan', 'focus_lesson', 'adjust_difficulty',
  // TQ-221: AI tool switching actions
  'recommend_tool', 'delegate_to_tool', 'switch_tool',
])
export const mentorActionSchema = z.object({
  type: mentorActionType,
  reason: trimmedString(2000),
  targetLessonId: z.string().max(200).optional(),
  targetLessonTitle: z.string().max(500).optional(),
  currentNextLessonId: z.string().max(200).optional(),
  currentNextLessonTitle: z.string().max(500).optional(),
  beforeLessonId: z.string().max(200).optional(),
  newOrder: z.array(z.object({
    lessonId: z.string().max(200),
    lessonTitle: z.string().max(500),
  })).max(100).optional(),
  planId: z.string().max(200).optional(),
  lessonId: z.string().max(200).optional(),
  direction: z.enum(['easier', 'harder']).optional(),
  // TQ-221: AI tool action fields
  stepId: z.string().max(200).optional(),
  toolId: z.string().max(200).optional(),
  toolLabel: z.string().max(200).optional(),
  fromToolId: z.string().max(200).nullable().optional(),
  toToolId: z.string().max(200).optional(),
  toToolLabel: z.string().max(200).optional(),
  delegationBrief: z.string().max(5000).optional(),
})
export type MentorActionInput = z.infer<typeof mentorActionSchema>

// ── /api/exercises/results POST ─────────────────────────────────
export const exerciseResultSchema = z.object({
  lesson_id: trimmedString(200),
  exercise_id: trimmedString(200),
  code: trimmedString(10_000),
  passed: z.boolean(),
})
export type ExerciseResultInput = z.infer<typeof exerciseResultSchema>
