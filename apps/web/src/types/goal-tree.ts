import { z } from 'zod/v4'

export const goalTreeOwnerTypeSchema = z.enum([
  'user',
  'ai',
  'both',
  'external',
  'blocked',
])

export const goalTreeSelectedLessonSchema = z.object({
  lesson_id: z.string().min(1),
  score: z.number(),
  rationale: z.string().nullable(),
})

export const goalTreeNodeSchema = z.object({
  id: z.string().min(1),
  parent_node_id: z.string().nullable(),
  label: z.string().min(1),
  node_type: z.enum(['objective', 'milestone', 'task', 'sub_task']),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked', 'skipped']),
  sort_order: z.number().int(),
  owner_type: goalTreeOwnerTypeSchema.optional().default('user'),
  depends_on_node_ids: z.array(z.string().min(1)).optional().default([]),
  fallback_node_id: z.string().min(1).nullable().optional().default(null),
  selected_lesson: goalTreeSelectedLessonSchema.nullable(),
})

export const goalTreeGoalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['active', 'paused', 'completed', 'archived']),
  created_at: z.string().min(1),
  deadline: z.string().nullable(),
  nodes: z.array(goalTreeNodeSchema),
})

export const goalTreeApiResponseSchema = z.object({
  goals: z.array(goalTreeGoalSchema),
})

export const goalContextGoalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: goalTreeGoalSchema.shape.status,
  deadline: z.string().nullable(),
  created_at: z.string().min(1),
})

export const goalContextNodeSummarySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  owner_type: goalTreeOwnerTypeSchema.optional().default('user'),
  status: goalTreeNodeSchema.shape.status,
  next_action_preview: z.string().nullable().optional().default(null),
})

export const goalContextMemoryItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  bullets: z.array(z.string()),
  source: z.string().min(1),
  created_at: z.string().min(1),
})

export const goalContextSourceItemSchema = z.object({
  id: z.string().min(1),
  node_id: z.string().min(1).nullable().optional().default(null),
  source_type: z.string().min(1),
  source_uri: z.string().nullable(),
  content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  freshness_at: z.string().nullable(),
  created_at: z.string().min(1),
})

export const goalContextArtifactItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  artifact_type: z.string().min(1),
  url: z.string().nullable(),
  content_preview: z.string().min(1),
  milestone_title: z.string().nullable(),
  step_title: z.string().nullable(),
  task_id: z.string().nullable(),
  created_at: z.string().min(1),
})

export const goalContextAssessmentSchema = z.object({
  capability_slug: z.string().min(1),
  label: z.string().min(1),
  latest_score: z.number(),
  latest_assessed_at: z.string().nullable(),
})

export const goalContextRecentChatUpdateSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['decision', 'open_question', 'next_action']),
  content: z.string().min(1),
  node_id: z.string().min(1).nullable().optional().default(null),
  source_type: z.string().min(1),
  source_uri: z.string().nullable(),
  chat_source: z.string().nullable().optional().default(null),
  created_at: z.string().min(1),
})

export const goalContextProfileSchema = z.object({
  role: z.string().nullable(),
  primary_goals: z.array(z.string()).default([]),
  experience_level: z.string().nullable(),
  tool_familiarity: z.string().nullable(),
  display_name: z.string().nullable().optional().default(null),
  experience_summary: z.string().nullable().optional().default(null),
  operating_system: z.string().nullable().optional().default(null),
  available_ai_tools: z.array(z.string()).optional().default([]),
}).nullable()

export const goalContextStateSchema = z.object({
  capabilities: z.array(z.string()).default([]),
  assessments_top5: z.array(goalContextAssessmentSchema).default([]),
  blockers: z.array(z.string()).optional().default([]),
  deadline_text: z.string().nullable().optional().default(null),
  target_outcome: z.string().nullable().optional().default(null),
  skill_level: z.string().nullable().optional().default(null),
}).nullable()

export const goalContextApiResponseSchema = z.object({
  goal: goalContextGoalSchema,
  nodes: z.array(goalContextNodeSummarySchema),
  profile: goalContextProfileSchema,
  state: goalContextStateSchema,
  mentor_memories: z.array(goalContextMemoryItemSchema),
  goal_contexts: z.array(goalContextSourceItemSchema),
  recent_chat_updates: z.array(goalContextRecentChatUpdateSchema),
  artifacts: z.array(goalContextArtifactItemSchema),
  decisions: z.array(z.string()),
  next_action: z.string().nullable(),
})

export const goalProgressTimelineActorSchema = z.enum([
  'user',
  'ai',
  'codex',
  'claude',
])

export const goalProgressTimelineEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'goal_context',
    'goal_node_status',
    'task_progress',
    'lesson_completion',
  ]),
  actor: goalProgressTimelineActorSchema,
  icon: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  occurred_at: z.string().min(1),
})

export const goalProgressTimelineResponseSchema = z.array(
  goalProgressTimelineEventSchema,
)

export type GoalTreeSelectedLesson = z.infer<typeof goalTreeSelectedLessonSchema>
export type GoalTreeOwnerType = z.infer<typeof goalTreeOwnerTypeSchema>
export type GoalTreeNode = z.infer<typeof goalTreeNodeSchema>
export type GoalTreeGoal = z.infer<typeof goalTreeGoalSchema>
export type GoalTreeApiResponse = z.infer<typeof goalTreeApiResponseSchema>
export type GoalContextGoal = z.infer<typeof goalContextGoalSchema>
export type GoalContextNodeSummary = z.infer<typeof goalContextNodeSummarySchema>
export type GoalContextMemoryItem = z.infer<typeof goalContextMemoryItemSchema>
export type GoalContextSourceItem = z.infer<typeof goalContextSourceItemSchema>
export type GoalContextArtifactItem = z.infer<typeof goalContextArtifactItemSchema>
export type GoalContextAssessment = z.infer<typeof goalContextAssessmentSchema>
export type GoalContextRecentChatUpdate = z.infer<typeof goalContextRecentChatUpdateSchema>
export type GoalContextProfile = z.infer<typeof goalContextProfileSchema>
export type GoalContextState = z.infer<typeof goalContextStateSchema>
export type GoalContextApiResponse = z.infer<typeof goalContextApiResponseSchema>
export type GoalProgressTimelineActor = z.infer<
  typeof goalProgressTimelineActorSchema
>
export type GoalProgressTimelineEvent = z.infer<
  typeof goalProgressTimelineEventSchema
>
