import { z } from 'zod/v4'

// ---------------------------------------------------------------------------
// Stage identifiers
// ---------------------------------------------------------------------------

/**
 * Pipeline stages the bridge is allowed to orchestrate.
 *
 * IMPORTANT: `publish` is intentionally NOT in this list. Publishing lessons
 * is an Owner-only manual step per the deep-research-report safety design.
 * The runner explicitly throws if anyone asks it to schedule `publish`.
 */
export const BridgeStageSchema = z.enum([
  'intake',
  'context-fetch',
  'draft',
  'critique',
  'media',
  'eval',
])
export type BridgeStage = z.infer<typeof BridgeStageSchema>

export const BRIDGE_STAGES: readonly BridgeStage[] = [
  'intake',
  'context-fetch',
  'draft',
  'critique',
  'media',
  'eval',
] as const

// ---------------------------------------------------------------------------
// Proposal input (subset of decision_ledger.lesson_dev_proposals row)
// ---------------------------------------------------------------------------

export const LessonDevProposalInputSchema = z
  .object({
    id: z.string().min(1),
    capability_slug: z.string().min(1),
    outcome_slug: z.string().min(1),
    priority: z.enum(['high', 'mid', 'low']),
    status: z.enum([
      'proposed',
      'approved',
      'reserved',
      'rejected',
      'in_factory',
      'addressed',
      'cancelled',
    ]),
    gap_ids: z.array(z.string()).default([]),
    weakest_axis: z.enum([
      'capability',
      'prerequisite',
      'blocker',
      'evidence',
    ]),
    evidence: z.record(z.string(), z.unknown()).default({}),
    candidate_lesson_slug: z.string().nullable().default(null),
    rationale: z.string().nullable().default(null),
    proposed_by: z.string().default('ai'),
    proposed_at: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough()
export type LessonDevProposalInput = z.infer<
  typeof LessonDevProposalInputSchema
>

// ---------------------------------------------------------------------------
// Intake bundle (owner-local YAML dict)
// ---------------------------------------------------------------------------

/**
 * Normalised intake bundle emitted from a proposal row.
 *
 * SHAPE MUST MATCH `lesson-factory/src/core/types.ts::intakeBundleSchema`
 * exactly — that schema is declared with `additionalProperties: false` and
 * `lesson-factory/src/pipelines/shared.ts::validateIntakeBundle` rejects any
 * unknown top-level keys when the downstream `lesson:research` /
 * `lesson:draft` commands validate the bundle.
 *
 * Required top-level fields (per lesson-factory contract):
 *   - goal: { summary, constraints[], hints[] }
 *   - target_personas: [{ tag, reason }]
 *   - candidate_capabilities: [{ capability, rationale }]
 *   - freshness_signals: [{ source, reason }]
 *   - classification: 'new_atom' | 'improve_existing' | 'anchor_only' | 'unsupported'
 *   - classification_reason: string
 *   - related_atom_ids: string[]
 *
 * Bridge-specific provenance (proposal id, gap ids, curriculum architecture,
 * evidence blob) is NOT a top-level field here because the lesson-factory
 * schema would reject it. Such provenance is nested as a structured suffix
 * inside `classification_reason` so nothing is lost while staying schema-
 * compliant. See `intake.ts::buildIntakeBundle`.
 */
export const IntakeBundleSchema = z
  .object({
    goal: z
      .object({
        summary: z.string(),
        constraints: z.array(z.string()).default([]),
        hints: z.array(z.string()).default([]),
        improve_guidance: z.array(z.string()).optional(),
      })
      .strict(),
    target_personas: z.array(
      z
        .object({
          tag: z.string().min(1),
          reason: z.string(),
        })
        .strict(),
    ),
    candidate_capabilities: z.array(
      z
        .object({
          capability: z.string().min(1),
          rationale: z.string(),
        })
        .strict(),
    ),
    freshness_signals: z.array(
      z
        .object({
          source: z.string().min(1),
          reason: z.string(),
        })
        .strict(),
    ),
    classification: z.enum([
      'new_atom',
      'improve_existing',
      'anchor_only',
      'unsupported',
    ]),
    classification_reason: z.string(),
    related_atom_ids: z.array(z.string()).default([]),
  })
  .strict()
export type IntakeBundle = z.infer<typeof IntakeBundleSchema>

// ---------------------------------------------------------------------------
// Plan / execution result
// ---------------------------------------------------------------------------

/**
 * Bridge-internal effects that the runner handles directly (no execa).
 *
 * These represent stages that don't correspond to a `pnpm lesson:*` CLI
 * command — e.g., `write-intake-yaml` materialises the in-memory IntakeBundle
 * onto disk at a path the downstream `lesson:research` / `lesson:draft`
 * commands expect as their first positional argument.
 */
export const BridgeEffectSchema = z.enum(['write-intake-yaml'])
export type BridgeEffect = z.infer<typeof BridgeEffectSchema>

export const StagePlanEntrySchema = z
  .object({
    stage: BridgeStageSchema,
    /**
     * CLI command to invoke (e.g. `pnpm`). `null` when the stage is a
     * bridge-internal effect (see `effect`) handled without shelling out.
     */
    cmd: z.string().nullable(),
    args: z.array(z.string()),
    skip: z.boolean().default(false),
    /**
     * Bridge-internal effect label. Set when `cmd` is null. The runner
     * dispatches on this field to perform the effect directly (e.g. file
     * writes) instead of shelling out via the pipeline client.
     */
    effect: BridgeEffectSchema.nullable().default(null),
  })
  .strict()
export type StagePlanEntry = z.infer<typeof StagePlanEntrySchema>

export const BridgePlanSchema = z
  .object({
    proposalId: z.string(),
    slug: z.string(),
    stages: z.array(BridgeStageSchema),
    entries: z.array(StagePlanEntrySchema),
    intake: IntakeBundleSchema,
    createdAt: z.string(),
  })
  .strict()
export type BridgePlan = z.infer<typeof BridgePlanSchema>

export const StageResultSchema = z
  .object({
    stage: BridgeStageSchema,
    status: z.enum(['success', 'failed', 'skipped']),
    stdout: z.string().default(''),
    stderr: z.string().default(''),
    durationMs: z.number().int().nonnegative().default(0),
    error: z.string().nullable().default(null),
  })
  .strict()
export type StageResult = z.infer<typeof StageResultSchema>

export const BridgeResultSchema = z
  .object({
    runId: z.string(),
    proposalId: z.string(),
    slug: z.string(),
    status: z.enum(['success', 'failed']),
    failedStage: BridgeStageSchema.nullable().default(null),
    stageResults: z.array(StageResultSchema),
    startedAt: z.string(),
    finishedAt: z.string(),
    error: z.string().nullable().default(null),
  })
  .strict()
export type BridgeResult = z.infer<typeof BridgeResultSchema>

// ---------------------------------------------------------------------------
// Approval row (subset of decision_ledger.approval_gates)
// ---------------------------------------------------------------------------

export const ApprovalRowSchema = z
  .object({
    id: z.string(),
    gate_type: z.enum([
      'deploy',
      'migration',
      'schedule_confirm',
      'budget',
      'general',
      'lesson_proposal',
    ]),
    status: z.enum(['pending', 'approved', 'rejected', 'expired']),
    decided_by: z.string().nullable(),
    decided_at: z.string().nullable(),
    reason: z.string().nullable(),
    expires_at: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .passthrough()
export type ApprovalRow = z.infer<typeof ApprovalRowSchema>
