/**
 * Goal-First Planner Types
 *
 * Types for the goal-first planning pipeline that replaces
 * the regex-based track detection with flexible domain classification
 * and cross-track lesson selection.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// ── Goal normalization ──

export interface NormalizedGoal {
  /** Original user input */
  raw: string
  /** Cleaned/trimmed text */
  cleaned: string
  /** Detected language */
  language: 'ja' | 'en'
  /** Domain slugs implied by the goal text */
  implied_domains: string[]
  /** Tool names mentioned in the goal */
  tool_mentions: string[]
  /** Deadline phrase if detected (e.g. "3ヶ月以内", "by next month") */
  deadline_mention?: string
  /** One-line summary of what the learner wants to achieve */
  outcome_summary: string
  /** Constraints inferred from the goal (time, budget, tech, etc.) */
  constraints?: string[]
  /** Concrete success criteria extracted from the goal */
  success_criteria?: string[]
  /** Inferred preferred learning style */
  inferred_learning_style?: 'hands-on' | 'conceptual' | 'mixed' | null
  /** Skill signals inferred from the goal */
  skill_signals?: {
    current_level: 'beginner' | 'intermediate' | 'advanced'
    strengths: string[]
    gaps: string[]
  } | null
  /** MVP support status inferred during normalization */
  supportStatus?: 'supported' | 'coming-soon'
  /** Human-readable MVP support message for unsupported domains */
  supportMessage?: string | null
}

// ── Domain classification ──

export interface DomainScore {
  slug: string
  confidence: number
}

export interface DomainClassification {
  /** All matched domains sorted by confidence descending */
  domains: DomainScore[]
  /** The highest-confidence domain slug */
  primary: string
  /** True if multiple domains have confidence > 0.3 */
  isMixed: boolean
}

// ── Lesson candidate retrieval ──

export type PlannerDataClient = SupabaseClient<Database>

export interface LearnerCapabilityState {
  capabilitySlug: string
  latestScore: number
  latestAssessedAt: string | null
}

export interface CandidateQuery {
  client?: PlannerDataClient | null
  domainIds: string[]
  domainSlugs?: string[]
  capabilityIds?: string[]
  learnerCapabilityState?: LearnerCapabilityState[]
  difficultyRange?: { min: string; max: string }
  toolProfile?: string
  preferredTools?: string[]
  learnerProfile?: unknown
  learnerState?: unknown
  completedLessonIds?: string[]
  maxResults?: number
  mentorMemorySummaries?: string[]
  blockerHistory?: string[]
  weaknesses?: string[]
  stuckPatterns?: string[]
  negativeFeedback?: string[]
  learningStyle?: string | null
}

export interface LessonCandidate {
  lessonId: string
  title: string
  domainSlug: string
  score: number
  reason: string
  difficulty: string
  estimatedMinutes: number
  prerequisiteIds: string[]
  capabilityTags: string[]
}

// ── Compiled plan ──

export interface CompiledPlan {
  status?: 'ready' | 'candidates_unavailable'
  title: string
  summary: string
  goalId?: string
  milestones: CompiledMilestone[]
  nodes: CompiledPlanNode[]
  gapTasks: GapTask[]
  metadata: {
    totalEstimatedMinutes: number
    lessonCount: number
    domainsCovered: string[]
    supportStatus?: 'supported' | 'coming-soon'
    supportMessage?: string | null
  }
}

export interface CompiledMilestone {
  id: string
  title: string
  description: string
  nodeIds: string[]
}

export interface CompiledPlanNode {
  id: string
  lessonId: string
  lessonTitle: string
  milestoneId: string
  sortOrder: number
  rationale: string
  difficulty: string
  estimatedMinutes: number
  prerequisiteNodeIds: string[]
}

export interface GapTask {
  id: string
  title: string
  description: string
  missingCapability: string
}

// ── Next action resolution ──

export interface NextAction {
  type:
    | 'lesson'
    | 'evidence'
    | 'review'
    | 'graduated'
    | 'blocked'
    | 'plan_revised'
  nodeId?: string
  lessonId?: string
  message: string
  /** Set when type === 'plan_revised'. */
  revisionId?: string
  /** Present only when type === 'lesson'. */
  bridgeQuestion?: string
}

// ── Orchestrator params ──

export interface PlanCompileParams {
  client?: PlannerDataClient | null
  goal: NormalizedGoal
  domains: DomainClassification
  learnerProfile: import('@/types').LearnerProfile
  learnerState: import('@/types').LearnerState
  completedLessonIds: string[]
  learnerCapabilityState?: LearnerCapabilityState[]
  toolProfile?: string
  preferredTools?: string[]
  mentorMemories?: string[]
  blockers?: string[]
  weaknesses?: string[]
  recentFeedback?: string[]
  learningStyle?: string | null
  stuckPatterns?: string[]
  negativeFeedback?: string[]
}
