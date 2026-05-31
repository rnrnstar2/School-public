export type LessonStatus = 'draft' | 'reviewed' | 'experimental' | 'stable' | 'archived'

export type DeliverableType =
  | 'sql_policy'
  | 'code_snippet'
  | 'config_file'
  | 'screenshot'
  | 'url'
  | 'markdown_doc'
  | 'test_suite'

export type EvidenceType =
  | 'sql_snippet'
  | 'test_result'
  | 'screenshot'
  | 'url'
  | 'code_diff'
  | 'log_output'

export type MediaSlotType = 'diagram' | 'screen_capture' | 'video_walkthrough' | 'icon'

export interface Lesson {
  id: string
  title: string
  /** Optional short summary used by /lessons card view (TQ-117 backfill). */
  summary?: string
  persona_tags: string[]
  goal_tags: string[]
  capability_inputs: string[]
  capability_outputs: string[]
  hard_prerequisites: string[]
  soft_prerequisites: string[]
  deliverable: {
    type: DeliverableType
    validation: string
  }
  evidence: EvidenceType[]
  media_slots: MediaSlotType[]
  freshness_sources: string[]
  /** Estimated learner time-to-complete in minutes (1..180). TQ-222 backfill: required by Shortest-Path Planner (TQ-235). */
  estimated_minutes?: number
  status: LessonStatus
}

export interface LessonDraft {
  lesson_yaml: string
  body_markdown: string
  image_briefs: string[]
  video_briefs: string[]
  eval_cases: string[]
  anticipated_blockers: string[]
  pr_summary: string
}

export type CritiqueSeverity = 'low' | 'medium' | 'high' | 'critical'
export type CritiqueStatus = 'accept' | 'revise' | 'block'

export interface CritiqueIssue {
  severity: CritiqueSeverity
  category: string
  location: string
  message: string
  suggested_fix: string
}

export interface Critique {
  lesson_id: string
  critic_model: string
  issues: CritiqueIssue[]
  overall_score: number
  recommend_status: CritiqueStatus
}

export interface Asset {
  asset_id: string
  type: 'image' | 'video'
  source_adapter: string
  source_model: string
  prompt_used: string
  file_path: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface SubscriptionImagegenJob {
  job_id: string
  lesson_id: string
  slot: string
  brief: string
  prompt: string
  asset_id: string
  target_file_path: string
  public_file_path: string
  mime_type: 'image/png'
}

export interface SubscriptionImagegenQueue {
  version: 'lesson-media-imagegen-queue/v1'
  run_id: string
  created_at: string
  lesson_id: string
  generator: {
    mode: 'codex-built-in-imagegen'
    api_key_required: false
    subscription_required: true
  }
  instructions: string[]
  jobs: SubscriptionImagegenJob[]
  skipped_video_briefs: string[]
}

export interface IntakeGoal {
  summary: string
  constraints: string[]
  hints: string[]
  improve_guidance?: string[]
}

export interface IntakePersona {
  tag: string
  reason: string
}

export interface CandidateCapability {
  capability: string
  rationale: string
}

export interface FreshnessSignal {
  source: string
  reason: string
}

export interface FreshContext {
  id: string
  source: 'twitter' | 'web' | 'rss' | 'github' | 'news'
  url: string
  author: string
  text: string
  fetched_at: string
  engagement: {
    likes?: number
    retweets?: number
    replies?: number
    impressions?: number
  }
  language: string
  matched_signal: FreshnessSignal
}

export interface FreshContextBundle {
  run_id: string
  fetched_at: string
  signals: FreshnessSignal[]
  contexts: FreshContext[]
}

export type IntakeClassification =
  | 'new_atom'
  | 'improve_existing'
  | 'anchor_only'
  | 'unsupported'

export interface IntakeBundle {
  goal: IntakeGoal
  target_personas: IntakePersona[]
  candidate_capabilities: CandidateCapability[]
  freshness_signals: FreshnessSignal[]
  classification: IntakeClassification
  classification_reason: string
  related_atom_ids: string[]
}

export interface ExistingAtomSummary {
  id: string
  title: string
  capability_outputs: string[]
  status: LessonStatus
}

export interface LessonDraftInput {
  run_id: string
  instruction: string
  intake_bundle: IntakeBundle
  related_existing_atoms: Lesson[]
  fresh_context_bundle?: FreshContextBundle
  dry_run?: boolean
}

export interface SceneSpec {
  run_id: string
  lesson_id: string
  slot: string
  prompt: string
  output_path: string
  instruction: string
  dry_run?: boolean
}

export interface VideoScript {
  lesson_id: string
  slot: string
  prompt: string
  output_path: string
  dry_run?: boolean
}

export interface VideoStyle {
  format: string
  duration_seconds: number
}

export interface SchemaEval {
  status: 'pass' | 'fail'
  violations: string[]
}

export interface PedagogyEval {
  status: 'pass' | 'fail'
  score: number
  comments: string[]
}

export interface ExecutionEval {
  status: 'pass' | 'fail'
  trace: string[]
  failed_steps: string[]
}

export interface PersonaStuckPoint {
  persona: string
  step: string
  issue: string
  mitigation: string
}

export interface PersonaSimulation {
  status: 'pass' | 'fail'
  stuck_points: PersonaStuckPoint[]
}

export type EvalRecommendStatus = 'revise' | 'reviewed_candidate'

export interface EvalBundle {
  schema_eval: SchemaEval
  pedagogy_eval: PedagogyEval
  execution_eval: ExecutionEval
  persona_simulation: PersonaSimulation
  recommend_status: EvalRecommendStatus
  status_rationale: string
}

export interface PublishFile {
  path: string
  source: string
  notes: string
}

export interface PublishBundle {
  lesson_id: string
  files_to_write: PublishFile[]
  pr_summary: string
  unresolved_risks: string[]
  suggested_status: Exclude<LessonStatus, 'draft' | 'stable' | 'archived'>
  owner_review_required: true
}

export type StageName =
  | 'intake'
  | 'context-fetch'
  | 'draft'
  | 'critique'
  | 'media'
  | 'eval'
  | 'publish'

export interface RunContext {
  runId: string
  timestamp: string
  stage: StageName
}

export interface PipelineExecutionOptions {
  adapterName?: string
  dryRun?: boolean
  runId?: string
}

export interface PipelineResult<T> {
  output: T
  outputPath?: string
  metaPath?: string
  context: RunContext
}

export interface RubricDefinition {
  name: string
  pedagogy_pass_score: number
  execution_requires_trace: boolean
  persona_count: {
    min: number
    max: number
  }
}

export interface PersonaDefinition {
  tag: string
  step_focus: string
  default_issue: string
  default_mitigation: string
}

export const intakeBundleSchema = {
  $id: 'https://school.local/lesson-factory/internal/intake-bundle.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'goal',
    'target_personas',
    'candidate_capabilities',
    'freshness_signals',
    'classification',
    'classification_reason',
    'related_atom_ids',
  ],
  properties: {
    goal: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'constraints', 'hints'],
      properties: {
        summary: { type: 'string' },
        constraints: {
          type: 'array',
          items: { type: 'string' },
        },
        hints: {
          type: 'array',
          items: { type: 'string' },
        },
        improve_guidance: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    target_personas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tag', 'reason'],
        properties: {
          tag: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    candidate_capabilities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'rationale'],
        properties: {
          capability: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    freshness_signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'reason'],
        properties: {
          source: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    classification: {
      type: 'string',
      enum: ['new_atom', 'improve_existing', 'anchor_only', 'unsupported'],
    },
    classification_reason: { type: 'string' },
    related_atom_ids: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

export const assetArraySchema = {
  $id: 'https://school.local/lesson-factory/internal/assets.schema.json',
  type: 'array',
  items: {
    $ref: 'https://school.local/lesson-factory/schemas/asset.schema.json',
  },
} as const

export const evalBundleSchema = {
  $id: 'https://school.local/lesson-factory/internal/eval-bundle.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_eval',
    'pedagogy_eval',
    'execution_eval',
    'persona_simulation',
    'recommend_status',
    'status_rationale',
  ],
  properties: {
    schema_eval: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'violations'],
      properties: {
        status: { type: 'string', enum: ['pass', 'fail'] },
        violations: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    pedagogy_eval: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'score', 'comments'],
      properties: {
        status: { type: 'string', enum: ['pass', 'fail'] },
        score: { type: 'number', minimum: 0, maximum: 5 },
        comments: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    execution_eval: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'trace', 'failed_steps'],
      properties: {
        status: { type: 'string', enum: ['pass', 'fail'] },
        trace: {
          type: 'array',
          items: { type: 'string' },
        },
        failed_steps: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    persona_simulation: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'stuck_points'],
      properties: {
        status: { type: 'string', enum: ['pass', 'fail'] },
        stuck_points: {
          type: 'array',
          minItems: 3,
          maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['persona', 'step', 'issue', 'mitigation'],
            properties: {
              persona: { type: 'string' },
              step: { type: 'string' },
              issue: { type: 'string' },
              mitigation: { type: 'string' },
            },
          },
        },
      },
    },
    recommend_status: {
      type: 'string',
      enum: ['revise', 'reviewed_candidate'],
    },
    status_rationale: { type: 'string' },
  },
} as const

export const publishBundleSchema = {
  $id: 'https://school.local/lesson-factory/internal/publish-bundle.schema.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'lesson_id',
    'files_to_write',
    'pr_summary',
    'unresolved_risks',
    'suggested_status',
    'owner_review_required',
  ],
  properties: {
    lesson_id: { type: 'string' },
    files_to_write: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'source', 'notes'],
        properties: {
          path: { type: 'string' },
          source: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    pr_summary: { type: 'string' },
    unresolved_risks: {
      type: 'array',
      items: { type: 'string' },
    },
    suggested_status: {
      type: 'string',
      enum: ['reviewed', 'experimental'],
    },
    owner_review_required: { const: true },
  },
} as const
