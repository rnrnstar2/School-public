// ============================================
// Canonical Domain Types — Goal-First Architecture
// ============================================
//
// This file defines the canonical domain types for the School platform,
// designed for goal-first (not track-first) architecture.
// Each type includes: TypeScript interface, Zod schema, and Input type.
//
// NOTE: Type definition file only. No implementation logic.
// ============================================

import { z } from 'zod';

// Re-export backward-compatible types from index.ts
export type {
  LearnerProfile,
  LearnerProfileInput,
  LearnerState,
  LearnerStateInput,
  LearnerStateSignals,
  LearnerSkillLevel,
  LearnerCliFamiliarity,
  MentorMemory,
  MentorMemoryInput,
  MentorMemorySource,
  LessonChatMessage,
  LessonChatSession,
  LessonChatSummary,
  HearingChatMessage,
  HearingChatSession,
  LessonFeedback,
  LessonFeedbackInput,
  LessonFeedbackAdjustmentProposal,
  LessonFeedbackSuggestion,
  AiResponseFeedbackChatContext,
  AiResponseFeedbackRating,
  AiResponseFeedbackReason,
  AiResponseFeedbackInput,
  ApiResponse,
  MentorSessionAction,
  MentorSessionPhase,
} from './index';

// ============================================
// Union types
// ============================================

export const LessonBlockTypeEnum = z.enum([
  'markdown',
  'image',
  'video',
  'checklist',
  'quiz',
  'code_prompt',
  'reflection',
  'rubric',
  'callout',
  'artifact_submit',
]);
export type LessonBlockType = z.infer<typeof LessonBlockTypeEnum>;

export const PlanNodeStatusEnum = z.enum([
  'pending',
  'active',
  'completed',
  'skipped',
  'blocked',
]);
export type PlanNodeStatus = z.infer<typeof PlanNodeStatusEnum>;

// ============================================
// 1. Goal — user's declared learning objective
// ============================================

export const GoalStatusEnum = z.enum(['active', 'completed', 'abandoned']);
export type GoalStatus = z.infer<typeof GoalStatusEnum>;

export const GoalSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  outcome: z.string().min(1),
  structured_intent: z.record(z.string(), z.unknown()).nullable(),
  domain_ids: z.array(z.string().uuid()),
  deadline: z.string().datetime().nullable().optional(),
  current_skill: z.string().nullable(),
  preferred_tools: z.array(z.string()),
  environment: z.string().nullable(),
  learning_style: z.string().nullable(),
  constraints: z.record(z.string(), z.unknown()).nullable(),
  status: GoalStatusEnum,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Goal = z.infer<typeof GoalSchema>;

export const GoalInputSchema = GoalSchema.omit({
  id: true,
  user_id: true,
  created_at: true,
  updated_at: true,
}).partial({
  structured_intent: true,
  domain_ids: true,
  deadline: true,
  current_skill: true,
  preferred_tools: true,
  environment: true,
  learning_style: true,
  constraints: true,
  status: true,
});

export type GoalInput = z.infer<typeof GoalInputSchema>;

// ============================================
// 2. Domain — broad learning area
// ============================================

export const KnownDomainSlugEnum = z.enum(['web', 'automation', 'content', 'app']);
export const DomainSlugEnum = z.union([KnownDomainSlugEnum, z.string().min(1)]);
export type KnownDomainSlug = z.infer<typeof KnownDomainSlugEnum>;
export type DomainSlug = z.infer<typeof DomainSlugEnum>;

export const DomainSchema = z.object({
  id: z.string().uuid(),
  slug: DomainSlugEnum,
  label: z.string().min(1),
  description: z.string(),
  icon: z.string().nullable().optional(),
  sort_order: z.number().int().nonnegative(),
});

export type Domain = z.infer<typeof DomainSchema>;

export const DomainInputSchema = DomainSchema.omit({ id: true });

export type DomainInput = z.infer<typeof DomainInputSchema>;

// ============================================
// 3. Capability — specific skill within a domain
// ============================================

export const CapabilitySchema = z.object({
  id: z.string().uuid(),
  domain_id: z.string().uuid(),
  slug: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  rubric_criteria: z.string(),
});

export type Capability = z.infer<typeof CapabilitySchema>;

export const CapabilityInputSchema = CapabilitySchema.omit({ id: true });

export type CapabilityInput = z.infer<typeof CapabilityInputSchema>;

// ============================================
// 4. Lesson — canonical lesson identity
// ============================================

export const LessonIdentitySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  domain_ids: z.array(z.string().uuid()),
  created_at: z.string().datetime(),
});

export type LessonIdentity = z.infer<typeof LessonIdentitySchema>;

export const LessonIdentityInputSchema = LessonIdentitySchema.omit({
  id: true,
  created_at: true,
});

export type LessonIdentityInput = z.infer<typeof LessonIdentityInputSchema>;

// ============================================
// 5. LessonVersion — immutable versioned content
// ============================================

export const LessonVersionStatusEnum = z.enum([
  'draft',
  'review',
  'published',
  'archived',
]);
export type LessonVersionStatus = z.infer<typeof LessonVersionStatusEnum>;

export const LessonVersionSchema = z.object({
  id: z.string().uuid(),
  lesson_id: z.string().uuid(),
  version: z.number().int().positive(),
  status: LessonVersionStatusEnum,
  published_at: z.string().datetime().nullable().optional(),
  archived_at: z.string().datetime().nullable().optional(),
  author_id: z.string().uuid().nullable().optional(),
  changelog: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});

export type LessonVersion = z.infer<typeof LessonVersionSchema>;

export const LessonVersionInputSchema = LessonVersionSchema.omit({
  id: true,
  created_at: true,
}).partial({
  published_at: true,
  archived_at: true,
  author_id: true,
  changelog: true,
  status: true,
});

export type LessonVersionInput = z.infer<typeof LessonVersionInputSchema>;

// ============================================
// 6. LessonBlock — content unit within a version
// ============================================

export const LessonBlockSchema = z.object({
  id: z.string().uuid(),
  lesson_version_id: z.string().uuid(),
  type: LessonBlockTypeEnum,
  sort_order: z.number().int().nonnegative(),
  content: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime(),
});

export type LessonBlock = z.infer<typeof LessonBlockSchema>;

export const LessonBlockInputSchema = LessonBlockSchema.omit({
  id: true,
  created_at: true,
});

export type LessonBlockInput = z.infer<typeof LessonBlockInputSchema>;

// ============================================
// 7. LessonAsset — media reference
// ============================================

export const LessonAssetTypeEnum = z.enum(['image', 'video', 'pdf', 'embed']);
export type LessonAssetType = z.infer<typeof LessonAssetTypeEnum>;

export const LessonAssetSchema = z.object({
  id: z.string().uuid(),
  lesson_version_id: z.string().uuid(),
  type: LessonAssetTypeEnum,
  url: z.string().url(),
  storage_key: z.string().nullable().optional(),
  mime_type: z.string().nullable().optional(),
  alt_text: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  file_size: z.number().int().nonnegative().nullable().optional(),
  created_at: z.string().datetime(),
});

export type LessonAsset = z.infer<typeof LessonAssetSchema>;

export const LessonAssetInputSchema = LessonAssetSchema.omit({
  id: true,
  created_at: true,
}).partial({
  storage_key: true,
  mime_type: true,
  alt_text: true,
  caption: true,
  file_size: true,
});

export type LessonAssetInput = z.infer<typeof LessonAssetInputSchema>;

// ============================================
// 8. LessonObjective — links lesson to capability
// ============================================

export const LessonObjectiveWeightEnum = z.enum(['primary', 'secondary']);
export type LessonObjectiveWeight = z.infer<typeof LessonObjectiveWeightEnum>;

export const LessonObjectiveSchema = z.object({
  id: z.string().uuid(),
  lesson_id: z.string().uuid(),
  capability_id: z.string().uuid(),
  weight: LessonObjectiveWeightEnum,
});

export type LessonObjective = z.infer<typeof LessonObjectiveSchema>;

export const LessonObjectiveInputSchema = LessonObjectiveSchema.omit({
  id: true,
});

export type LessonObjectiveInput = z.infer<typeof LessonObjectiveInputSchema>;

// ============================================
// 9. LessonPrerequisite — graph edge
// ============================================

export const PrerequisiteStrengthEnum = z.enum([
  'required',
  'recommended',
  'reinforcing',
]);
export type PrerequisiteStrength = z.infer<typeof PrerequisiteStrengthEnum>;

export const LessonPrerequisiteSchema = z.object({
  id: z.string().uuid(),
  lesson_id: z.string().uuid(),
  prerequisite_lesson_id: z.string().uuid(),
  strength: PrerequisiteStrengthEnum,
});

export type LessonPrerequisite = z.infer<typeof LessonPrerequisiteSchema>;

export const LessonPrerequisiteInputSchema = LessonPrerequisiteSchema.omit({
  id: true,
});

export type LessonPrerequisiteInput = z.infer<
  typeof LessonPrerequisiteInputSchema
>;

// ============================================
// 10. LessonVariant — tool-specific content overlay
// ============================================

export const ToolProfileSlugEnum = z.enum([
  'codex',
  'claude-code',
  'manual',
  'v0',
]);
export type ToolProfileSlug = z.infer<typeof ToolProfileSlugEnum>;

export const LessonVariantSchema = z.object({
  id: z.string().uuid(),
  lesson_version_id: z.string().uuid(),
  tool_profile_slug: ToolProfileSlugEnum,
  override_blocks: z.array(z.record(z.string(), z.unknown())),
  created_at: z.string().datetime(),
});

export type LessonVariant = z.infer<typeof LessonVariantSchema>;

export const LessonVariantInputSchema = LessonVariantSchema.omit({
  id: true,
  created_at: true,
});

export type LessonVariantInput = z.infer<typeof LessonVariantInputSchema>;

// ============================================
// 11. Plan — compiled for specific user+goal
// ============================================

export const PlanStatusEnum = z.enum([
  'active',
  'completed',
  'superseded',
  'abandoned',
]);
export type PlanStatus = z.infer<typeof PlanStatusEnum>;

export const PlanSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  goal_id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().nullable(),
  status: PlanStatusEnum,
  version: z.number().int().positive(),
  parent_plan_id: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Plan = z.infer<typeof PlanSchema>;

export const PlanInputSchema = PlanSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).partial({
  summary: true,
  status: true,
  version: true,
  parent_plan_id: true,
});

export type PlanInput = z.infer<typeof PlanInputSchema>;

// ============================================
// 12. PlanNode — step in plan
// ============================================

export const PlanNodeSchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  lesson_id: z.string().uuid(),
  milestone_title: z.string().min(1),
  sort_order: z.number().int().nonnegative(),
  status: PlanNodeStatusEnum,
  rationale: z.string().nullable(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime(),
});

export type PlanNode = z.infer<typeof PlanNodeSchema>;

export const PlanNodeInputSchema = PlanNodeSchema.omit({
  id: true,
  created_at: true,
}).partial({
  status: true,
  rationale: true,
  started_at: true,
  completed_at: true,
});

export type PlanNodeInput = z.infer<typeof PlanNodeInputSchema>;

// ============================================
// 13. PlanRevision — change record
// ============================================

export const PlanRevisionSchema = z.object({
  id: z.string().uuid(),
  plan_id: z.string().uuid(),
  reason: z.string().min(1),
  changes_summary: z.string(),
  superseded_node_ids: z.array(z.string().uuid()),
  new_node_ids: z.array(z.string().uuid()),
  created_at: z.string().datetime(),
});

export type PlanRevision = z.infer<typeof PlanRevisionSchema>;

export const PlanRevisionInputSchema = PlanRevisionSchema.omit({
  id: true,
  created_at: true,
});

export type PlanRevisionInput = z.infer<typeof PlanRevisionInputSchema>;

// ============================================
// 14. EvidenceSubmission — artifact proof
// ============================================

export const EvidenceTypeEnum = z.enum([
  'url',
  'repo',
  'screenshot',
  'text',
  'artifact_metadata',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeEnum>;

export const EvidenceSubmissionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_node_id: z.string().uuid().nullable().optional(),
  lesson_id: z.string().uuid(),
  type: EvidenceTypeEnum,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  submitted_at: z.string().datetime(),
});

export type EvidenceSubmission = z.infer<typeof EvidenceSubmissionSchema>;

export const EvidenceSubmissionInputSchema = EvidenceSubmissionSchema.omit({
  id: true,
  submitted_at: true,
}).partial({
  plan_node_id: true,
  metadata: true,
});

export type EvidenceSubmissionInput = z.infer<
  typeof EvidenceSubmissionInputSchema
>;

// ============================================
// 15. CompetencyAssessment — rubric evaluation
// ============================================

export const AssessedByEnum = z.enum(['ai', 'mentor', 'self']);
export type AssessedBy = z.infer<typeof AssessedByEnum>;

export const CompetencyAssessmentSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  capability_id: z.string().uuid(),
  evidence_ids: z.array(z.string().uuid()),
  score: z.number().int().min(0).max(100),
  rubric_results: z.record(z.string(), z.unknown()),
  assessed_by: AssessedByEnum,
  assessed_at: z.string().datetime(),
});

export type CompetencyAssessment = z.infer<typeof CompetencyAssessmentSchema>;

export const CompetencyAssessmentInputSchema =
  CompetencyAssessmentSchema.omit({
    id: true,
    assessed_at: true,
  });

export type CompetencyAssessmentInput = z.infer<
  typeof CompetencyAssessmentInputSchema
>;

// ============================================
// 16. GraduationDecision — final determination
// ============================================

export const GraduationStatusEnum = z.enum(['graduated', 'not_ready']);
export type GraduationStatus = z.infer<typeof GraduationStatusEnum>;

export const GraduationDecisionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  goal_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  status: GraduationStatusEnum,
  competency_summary: z.record(z.string(), z.unknown()),
  certificate_id: z.string().uuid().nullable().optional(),
  decided_at: z.string().datetime(),
});

export type GraduationDecision = z.infer<typeof GraduationDecisionSchema>;

export const GraduationDecisionInputSchema = GraduationDecisionSchema.omit({
  id: true,
  decided_at: true,
}).partial({
  certificate_id: true,
});

export type GraduationDecisionInput = z.infer<
  typeof GraduationDecisionInputSchema
>;

// ============================================
// 17. ContentTag — discovery metadata
// ============================================

export const ContentTagCategoryEnum = z.enum([
  'skill',
  'tool',
  'topic',
  'persona',
]);
export type ContentTagCategory = z.infer<typeof ContentTagCategoryEnum>;

export const ContentTagSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  label: z.string().min(1),
  category: ContentTagCategoryEnum,
});

export type ContentTag = z.infer<typeof ContentTagSchema>;

export const ContentTagInputSchema = ContentTagSchema.omit({ id: true });

export type ContentTagInput = z.infer<typeof ContentTagInputSchema>;

// ============================================
// 18. ToolProfile — learner's tool environment
// ============================================

export const ToolProfileFullSlugEnum = z.enum([
  'codex',
  'claude-code',
  'manual',
  'v0',
  'cursor',
]);
export type ToolProfileFullSlug = z.infer<typeof ToolProfileFullSlugEnum>;

export const ToolProfileSchema = z.object({
  id: z.string().uuid(),
  slug: ToolProfileFullSlugEnum,
  label: z.string().min(1),
  category: z.string().min(1),
  requires_local_install: z.boolean(),
});

export type ToolProfile = z.infer<typeof ToolProfileSchema>;

export const ToolProfileInputSchema = ToolProfileSchema.omit({ id: true });

export type ToolProfileInput = z.infer<typeof ToolProfileInputSchema>;

// ============================================
// 19. RecommendationEvent — why lesson was suggested
// ============================================

export const RecommendationEventSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  plan_node_id: z.string().uuid(),
  lesson_id: z.string().uuid(),
  reason_type: z.string().min(1),
  reason_detail: z.string(),
  score: z.number().nullable().optional(),
  created_at: z.string().datetime(),
});

export type RecommendationEvent = z.infer<typeof RecommendationEventSchema>;

export const RecommendationEventInputSchema = RecommendationEventSchema.omit({
  id: true,
  created_at: true,
}).partial({
  score: true,
});

export type RecommendationEventInput = z.infer<
  typeof RecommendationEventInputSchema
>;

// ============================================
// 20. TrackView — marketing/discovery projection
// ============================================

export const TrackViewSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  label: z.string().min(1),
  headline: z.string().min(1),
  description: z.string(),
  target_learners: z.array(z.string()),
  lesson_ids: z.array(z.string().uuid()),
  domain_ids: z.array(z.string().uuid()),
  icon: z.string().nullable().optional(),
});

export type TrackView = z.infer<typeof TrackViewSchema>;

export const TrackViewInputSchema = TrackViewSchema.omit({ id: true }).partial({
  icon: true,
});

export type TrackViewInput = z.infer<typeof TrackViewInputSchema>;
