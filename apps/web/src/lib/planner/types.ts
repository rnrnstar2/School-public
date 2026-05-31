import type { LearnerCliFamiliarity, MentorChatStructuredOutput } from '@/types'
import type { AiPersonalizationContext } from '@/lib/planner/ai-personalization'
import type { LessonMediaRef } from '@/lib/curriculum/lesson-media'
import type { LessonContentType } from '@/types'

export interface PlannerTrackModule {
  id: string
  title: string
  description: string
  outcome: string
  milestoneIds: string[]
}

export interface PlannerTrackMilestone {
  id: string
  title: string
  description: string
  evidence: string[]
}

export interface PlannerTrackDependency {
  lessonId: string
  type: string
}

export interface PlannerTrackExercise {
  id: string
  title: string
  instruction: string
  language: 'html' | 'css' | 'javascript' | 'typescript' | 'jsx' | 'tsx'
  starterCode: string
  solutionHint: string
  validationPatterns: string[]
}

export interface PlannerLessonSearchMetadata {
  locale: 'ja'
  tags: string[]
  searchTerms: string[]
  searchText: string
}

export interface PlannerLessonSelectionMetadata {
  sequencingModes: string[]
  projectTypes: string[]
  canSkipWhen: string[]
  evidenceSignals: string[]
}

export interface PlannerTrackStarterLesson {
  id: string
  title: string
  trackId: string
  moduleId: string
  milestoneId: string
  version: number
  status: 'draft' | 'published'
  summary: string
  promise: string
  whyThisMatters?: string
  howToDo?: string
  commonBlockers?: string
  confirmationMethod?: string
  content?: string
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced'
  skillLevel: {
    min: 'beginner' | 'intermediate' | 'advanced'
    recommended: 'beginner' | 'intermediate' | 'advanced'
    max: 'beginner' | 'intermediate' | 'advanced'
  }
  estimatedMinutes: number
  lessonType: 'plan' | 'setup' | 'build' | 'data' | 'deploy' | 'polish'
  deliveryMode: 'guided' | 'interactive'
  exercises?: PlannerTrackExercise[]
  moduleTitle: string
  primaryOutcome: string
  outputs: string[]
  prerequisiteIds: string[]
  recommendedBeforeIds: string[]
  mutuallyReinforcingIds: string[]
  dependencies: PlannerTrackDependency[]
  unlocks: string[]
  stack: {
    frameworks: string[]
    backend: string[]
    database: string[]
    styling: string[]
    ui: string[]
    hosting: string[]
    tooling: string[]
  }
  personaTags: string[]
  goalTags: string[]
  capabilityTags: string[]
  blockerTags: string[]
  contentTypes: LessonContentType[]
  searchTerms: string[]
  searchMetadata: PlannerLessonSearchMetadata
  selectionMetadata: PlannerLessonSelectionMetadata
  media_refs?: LessonMediaRef[]
}

export interface PlannerCurriculumTrack {
  id: string
  label: string
  headline: string
  summary: string
  promise: string
  targetStack: string[]
  lessons: PlannerTrackStarterLesson[]
  modules: PlannerTrackModule[]
  milestones: PlannerTrackMilestone[]
}

export type PlannerSupportStatus = 'supported' | 'coming-soon'

export interface PlannerRequest {
  goal: string
  locale?: 'ja'
  hearing?: PlannerHearingAnswers
  hearingInsights?: PlannerHearingInsights
  personalization?: AiPersonalizationContext | null
}

export interface PlannerConversationMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
}

export interface PlannerMentorSpaceMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
}

export type PlannerHearingQuestionId =
  | 'experience'
  | 'purpose'
  | 'siteBehavior'
  | 'existingMaterials'
  | 'operatingSystem'
  | 'localWorkCapability'
  | 'cliFamiliarity'
  | 'aiTools'

export interface PlannerHearingAnswers {
  experience: string
  purpose: string
  siteBehavior: string
  existingMaterials: string
  operatingSystem: string
  localWorkCapability: string
  cliFamiliarity: string
  aiTools: string
}

export type PlannerHearingProjectType = 'content-site' | 'database-app' | 'authenticated-app'

export interface PlannerHearingInsights {
  buildGoal: string | null
  audience: string | null
  deadline: string | null
  projectType: PlannerHearingProjectType | null
  constraints: string[]
  preferences: string[]
  mustHaveFeatures: string[]
  planningFocus: string[]
}

export interface PlannerHearingQuestion {
  id: PlannerHearingQuestionId
  label: string
  prompt: string
  choices?: string[]
}

export interface PlannerHearingSummaryEntry {
  id: PlannerHearingQuestionId
  label: string
  value: string
}

export interface PlannerHearingSession {
  answers: Partial<PlannerHearingAnswers>
  insights?: PlannerHearingInsights
  messages: PlannerConversationMessage[]
  lastQuestionId?: PlannerHearingQuestionId | null
  transport: PlannerHearingTransport
  completedAt?: string | null
  summaryKeyPoints?: string[]
  personaIds?: string[]
}

export interface PlannerHearingTransport {
  status: 'live' | 'fallback' | 'unavailable'
  label: string
  message: string
  model?: string
  endpoint?: string
}

export type MentorSessionPhase =
  | 'discovering'
  | 'clarifying_goal'
  | 'ready_to_plan'
  | 'planning'
  | 'coaching'
  | 'executing'
  | 'stuck'
  | 'reviewing'

export interface MentorSessionTransport {
  status: 'live' | 'unavailable' | 'error'
  label: string
  message: string
  model?: string
  endpoint?: string
}

export interface MentorSessionState {
  id?: string | null
  goal: string
  canonicalGoalKey: string
  messages: PlannerConversationMessage[]
  historySummary?: string | null
  phase: MentorSessionPhase
  answers: Partial<PlannerHearingAnswers>
  insights?: PlannerHearingInsights
  lastQuestionId?: PlannerHearingQuestionId | null
  transport: MentorSessionTransport
  completedAt?: string | null
  summaryKeyPoints?: string[]
  personaIds?: string[]
  activePlanId?: string | null
  currentLessonId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface PlannerHearingTurnResult {
  session: PlannerHearingSession
  completed: boolean
  structuredOutput?: MentorChatStructuredOutput
}

export interface PlannerPersistedHearingProfile {
  experienceSummary: string | null
  operatingSystem: string | null
  cliFamiliarity: LearnerCliFamiliarity | null
  availableAiTools: string[]
  canUseLocalTools: boolean | null
}

export interface PlannerPersistedHearingState {
  targetOutcome: string | null
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | null
  existingMaterials: string | null
  blockers: string[]
  signals: {
    has_node?: boolean
    has_git_repo?: boolean
    has_nextjs_app?: boolean
    has_supabase_project?: boolean
    has_vercel_account?: boolean
    wants_content_site?: boolean
    wants_static_site?: boolean
    wants_authenticated_app?: boolean
    wants_database_app?: boolean
    needs_backend?: boolean
    needs_nextjs?: boolean
    project_complexity?: 'static-site' | 'interactive-site' | 'web-app'
    recommended_stack?: string[]
  }
}

export interface PlannerPersistedHearingPayload {
  profile: PlannerPersistedHearingProfile
  state: PlannerPersistedHearingState
  insights: PlannerHearingInsights
}

export interface PlannerTrackPreview {
  trackId: string
  trackLabel: string
  headline: string
  summary: string
  promise: string
  targetStack: string[]
  modules: PlannerTrackModule[]
  milestones: PlannerTrackMilestone[]
  starterLessons: PlannerTrackStarterLesson[]
  totalLessons: number
}

export interface PlannerLessonReference {
  lessonId: string
  title: string
  summary: string
  estimatedMinutes: number
  moduleTitle: string
  whyNow?: string
  media_refs?: LessonMediaRef[]
  recommendationReason?: string
}

export interface PlannerContinuationStep {
  id: string
  title: string
  description: string
  outcome: string
  purpose: string
  completionCriteria: string
  artifacts: string[]
  requirement: 'required' | 'optional'
  estimateMinutes?: number
  milestoneId?: string
  lessonRefs: PlannerLessonReference[]
}

export interface PlannerPlanMilestone {
  id: string
  title: string
  description: string
  artifactGoal: string
  evidenceRule: string
  steps: PlannerContinuationStep[]
}

export interface PlannerContinuationPlan {
  kind: 'inline-plan'
  title: string
  summary: string
  ctaLabel: string
  steps: PlannerContinuationStep[]
  milestones: PlannerPlanMilestone[]
}

export interface PlannerMilestoneReference {
  id: string
  title: string
  description: string
  evidence: string[]
}

export interface PlannerCurrentTask {
  id: string
  title: string
  do: string
  learn: string
  why: string
  outcome: string
  lessonRefs: PlannerLessonReference[]
  resumeSummary?: string
}

export type PlannerTaskLessonConnectionId = 'do' | 'learn' | 'why'

export interface PlannerTaskLessonConnection {
  id: PlannerTaskLessonConnectionId
  label: 'Do' | 'Learn' | 'Why'
  value: string
  context: string
  lessonRefs: PlannerLessonReference[]
}

export interface PlannerResolvedTaskState {
  currentTask: PlannerCurrentTask
  relevantLessons: PlannerLessonReference[]
  lessonConnections: PlannerTaskLessonConnection[]
  blockedSuggestions: PlannerBlockedSuggestion[]
  supplementarySuggestions: PlannerSupplementarySuggestion[]
}

export interface PlannerBlockedSuggestion {
  lessonId: string
  title: string
  summary: string
  estimatedMinutes: number
  moduleTitle: string
  reason: string
}

export interface PlannerSupplementarySuggestion {
  lessonId: string
  title: string
  summary: string
  estimatedMinutes: number
  moduleTitle: string
  reason: string
  triggerLessonId: string
}

export interface PlannerToolRecommendation {
  name: string
  reason: string
  usageNote: string
  notFor?: string
  alternative?: {
    name: string
    reason: string
  }
}

export interface PlannerMentorMemorySummary {
  title: string
  bullets: string[]
}

export interface PlannerArtifactEntry {
  label: string
  detail: string
}

export type PlannerTaskProgressStatus = 'not-started' | 'in-progress' | 'completed' | 'on-hold' | 'blocked' | 'skipped'

export interface PlannerTaskProgressRecord {
  status: PlannerTaskProgressStatus
  title?: string
  do?: string
  learn?: string
  why?: string
  relevantLessonIds?: string[]
  startedAt?: string | null
  completedAt?: string | null
  elapsedMinutes?: number | null
  updatedAt: string
}

export interface PlannerMentorWorkspace {
  goalSummary: string
  currentMilestone: PlannerMilestoneReference
  currentTask: PlannerCurrentTask
  relevantLessons: PlannerLessonReference[]
  toolRecommendation: PlannerToolRecommendation
  mentorMemory?: PlannerMentorMemorySummary
  artifacts?: PlannerArtifactEntry[]
  hearingSummary?: PlannerHearingSummaryEntry[]
}

export interface PlannerNextAction {
  type: 'inline-continuation' | 'browse-lessons'
  label: string
  href?: string
}

export interface PlannerRecommendation {
  status: PlannerSupportStatus
  normalizedGoal: string
  userFacingGoal: string
  matchedIntent: string
  hearing?: PlannerHearingAnswers
  hearingInsights?: PlannerHearingInsights
  title: string
  summary: string
  detail: string
  nextAction: PlannerNextAction
  continuation?: PlannerContinuationPlan
  recommendedTrack?: PlannerTrackPreview
  mentorWorkspace?: PlannerMentorWorkspace
  supportMessage: string
  futureCategories?: string[]
}

export interface PlannerAdapterMetadata {
  id: string
  label: string
  mode: 'mock' | 'external'
  status: 'live' | 'fallback' | 'unavailable'
  message: string
  endpoint?: string
  model?: string
}

export interface PlannerAdapterResult {
  adapter: PlannerAdapterMetadata
  recommendation: PlannerRecommendation
  rawText?: string
}

export interface PlannerWorkspaceSnapshot {
  goal: string
  result: PlannerAdapterResult | null
  hearing?: PlannerHearingSession | null
  taskProgress: Record<string, PlannerTaskProgressRecord>
  selectedStepId?: string | null
  mentorMessages?: PlannerMentorSpaceMessage[]
  planId?: string | null
  savedAt: string
}

export interface PlannerAdapter {
  readonly metadata: PlannerAdapterMetadata
  plan(request: PlannerRequest): Promise<PlannerAdapterResult>
}

export interface CurriculumLibrary {
  tracks: PlannerCurriculumTrack[]
}
