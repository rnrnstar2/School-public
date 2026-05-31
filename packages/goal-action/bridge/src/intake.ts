import {
  type IntakeBundle,
  type LessonDevProposalInput,
  LessonDevProposalInputSchema,
} from './schema'

export type BuildIntakeOptions = {
  /** Optional override for classification. Defaults derived from `candidate_lesson_slug`. */
  classification?: IntakeBundle['classification']
  /** Optional slug of an existing curriculum architecture node the proposal targets. */
  curriculumArchitectureSlug?: string
}

/**
 * Convert a `lesson_dev_proposals` row into a normalised intake bundle dict.
 *
 * The bundle is a plain JS object; YAML serialisation is left to the caller.
 *
 * SHAPE CONTRACT — output MUST validate against
 * `lesson-factory/src/core/types.ts::intakeBundleSchema` which declares
 * `additionalProperties: false` at the top level. No bridge-specific keys
 * (capability_slug, metadata, etc.) may be emitted at the top level; they
 * are preserved inside `classification_reason` as a structured `[bridge: ...]`
 * suffix so `lesson:research` / `lesson:draft` validation does not reject
 * the payload while the proposal provenance stays traceable.
 *
 * Heuristics:
 *   - `target_personas`: proposals don't carry a persona hint, so we emit
 *     a single default persona tagged `learner`. If downstream pipelines
 *     need richer persona targeting, the owner can edit the on-disk YAML
 *     before running `lesson:research`.
 *   - `candidate_capabilities`: one entry synthesised from the proposal's
 *     `capability_slug` + rationale.
 *   - `freshness_signals`: ALWAYS contains at least one synthetic signal
 *     derived from proposal metadata (capability/outcome/proposed_at/gap_ids/
 *     rationale) because `lesson-factory/src/pipelines/context-fetch/index.ts`
 *     rejects an empty list and goal-action-proposer does not emit
 *     `evidence.source` today. If the proposal's `evidence.source` IS
 *     present it is emitted first AND the synthetic fallback is still
 *     appended so Owner review has both options.
 */
export function buildIntakeBundle(
  proposal: LessonDevProposalInput,
  opts: BuildIntakeOptions = {},
): IntakeBundle {
  const parsed = LessonDevProposalInputSchema.parse(proposal)

  const classification: IntakeBundle['classification'] =
    opts.classification ??
    (parsed.candidate_lesson_slug ? 'improve_existing' : 'new_atom')

  const summary = deriveGoalSummary(parsed)
  const constraints = deriveConstraints(parsed)
  const hints = deriveHints(parsed, opts.curriculumArchitectureSlug)
  const relatedAtomIds = parsed.candidate_lesson_slug
    ? [parsed.candidate_lesson_slug]
    : []

  const classificationReason = buildClassificationReason(
    parsed,
    opts.curriculumArchitectureSlug,
  )

  return {
    goal: {
      summary,
      constraints,
      hints,
    },
    target_personas: deriveTargetPersonas(parsed),
    candidate_capabilities: deriveCandidateCapabilities(parsed),
    freshness_signals: deriveFreshnessSignals(parsed),
    classification,
    classification_reason: classificationReason,
    related_atom_ids: relatedAtomIds,
  }
}

function deriveGoalSummary(proposal: LessonDevProposalInput): string {
  if (proposal.rationale && proposal.rationale.trim().length > 0) {
    return proposal.rationale.trim()
  }
  return `${proposal.capability_slug} / ${proposal.outcome_slug} gap (${proposal.weakest_axis})`
}

function deriveConstraints(proposal: LessonDevProposalInput): string[] {
  const constraints: string[] = []
  constraints.push(`weakest_axis=${proposal.weakest_axis}`)
  constraints.push(`priority=${proposal.priority}`)
  return constraints
}

function deriveHints(
  proposal: LessonDevProposalInput,
  curriculumArchitectureSlug: string | undefined,
): string[] {
  const hints: string[] = []
  if (proposal.candidate_lesson_slug) {
    hints.push(`candidate_lesson=${proposal.candidate_lesson_slug}`)
  }
  if (curriculumArchitectureSlug) {
    hints.push(`curriculum_architecture=${curriculumArchitectureSlug}`)
  }
  hints.push(`gap_count=${proposal.gap_ids.length}`)
  return hints
}

/**
 * Proposals don't carry a persona hint today, so we emit a single default
 * `learner` persona. Marked explicitly as a bridge-derived heuristic in the
 * `reason` so Owner reviewers know the YAML is a safe starting point but
 * should be refined before `lesson:research` if the real target persona is
 * known.
 */
function deriveTargetPersonas(
  proposal: LessonDevProposalInput,
): IntakeBundle['target_personas'] {
  return [
    {
      tag: 'learner',
      reason: `bridge default — proposal row carries no persona hint (capability=${proposal.capability_slug}, outcome=${proposal.outcome_slug})`,
    },
  ]
}

/**
 * Exactly one capability is synthesised from `proposal.capability_slug` with
 * the proposal rationale (or a composed fallback) as its justification. If
 * sibling capabilities become available on the proposal row in future, this
 * helper can be extended without altering callers.
 */
function deriveCandidateCapabilities(
  proposal: LessonDevProposalInput,
): IntakeBundle['candidate_capabilities'] {
  const rationale =
    proposal.rationale && proposal.rationale.trim().length > 0
      ? proposal.rationale.trim()
      : `gap detected on axis '${proposal.weakest_axis}' for outcome '${proposal.outcome_slug}'`

  return [
    {
      capability: proposal.capability_slug,
      rationale,
    },
  ]
}

/**
 * Freshness signal derivation.
 *
 * `lesson-factory/src/pipelines/context-fetch/index.ts` REJECTS an empty
 * `freshness_signals` array and throws "intake bundle has no
 * freshness_signals" before any adapter fetch happens. Proposals from
 * `@school/goal-action-proposer` do NOT emit `evidence.source` today —
 * so the bridge MUST synthesise at least one signal from available
 * proposal metadata or the downstream `execute()` path fails at the very
 * first CLI stage.
 *
 * Strategy:
 *   1. ALWAYS emit a synthetic default signal derived from proposal metadata
 *      (capability_slug / outcome_slug / proposed_at / gap_ids / rationale).
 *      This guarantees `freshness_signals.length >= 1`.
 *   2. If `proposal.evidence.source` IS a non-empty string, emit a real
 *      signal for it AS WELL (prepended so it leads). Owner review can
 *      then drop the synthetic fallback if the real one is sufficient.
 *   3. If for any reason the synthetic default cannot be built (e.g. empty
 *      capability_slug — shouldn't happen post-Zod-parse), throw a clear
 *      bundle-build error. Never silently return [].
 */
function deriveFreshnessSignals(
  proposal: LessonDevProposalInput,
): IntakeBundle['freshness_signals'] {
  const signals: IntakeBundle['freshness_signals'] = []

  const evidenceSource = proposal.evidence?.['source']
  if (typeof evidenceSource === 'string' && evidenceSource.trim().length > 0) {
    signals.push({
      source: evidenceSource.trim(),
      reason: `derived from lesson_dev_proposal evidence.source for ${proposal.capability_slug}`,
    })
  }

  // synthetic: derived from proposal metadata because goal-action-proposer
  // does not emit `evidence.source` today — context-fetch rejects empty lists
  const syntheticSource = `lesson_dev_proposal:${proposal.capability_slug}/${proposal.outcome_slug}`
  const rationaleSnippet =
    proposal.rationale && proposal.rationale.trim().length > 0
      ? proposal.rationale.trim()
      : `gap on axis '${proposal.weakest_axis}' for ${proposal.capability_slug}/${proposal.outcome_slug}`
  const gapRef =
    proposal.gap_ids.length > 0
      ? ` (gap_ids=${proposal.gap_ids.join(',')})`
      : ''
  const syntheticReason = `synthetic bridge signal proposed_at=${proposal.proposed_at}${gapRef}: ${rationaleSnippet}`

  if (
    syntheticSource.trim().length === 0 ||
    syntheticReason.trim().length === 0
  ) {
    throw new Error(
      'buildIntakeBundle: cannot synthesise a default freshness signal — proposal metadata insufficient. Refusing to emit empty freshness_signals.',
    )
  }

  signals.push({
    source: syntheticSource,
    reason: syntheticReason,
  })

  if (signals.length === 0) {
    // Defensive: the push above guarantees length >= 1. If we ever reach
    // here the synthesis logic has regressed — fail loud.
    throw new Error(
      'buildIntakeBundle: freshness_signals derivation produced an empty list; context-fetch would reject this bundle.',
    )
  }

  return signals
}

/**
 * Lesson-factory's intake schema is `additionalProperties: false` so the
 * bridge cannot emit a `metadata` object at the top level. We nest proposal
 * provenance as a structured `[bridge: ...]` suffix on `classification_reason`
 * so none of the original proposal info is lost. The primary reason still
 * leads so downstream readers see human-readable text first.
 */
function buildClassificationReason(
  proposal: LessonDevProposalInput,
  curriculumArchitectureSlug: string | undefined,
): string {
  const primary =
    proposal.rationale && proposal.rationale.trim().length > 0
      ? proposal.rationale.trim()
      : `Gap detected on axis '${proposal.weakest_axis}' for ${proposal.capability_slug} / ${proposal.outcome_slug}.`

  const provenance: Record<string, unknown> = {
    lesson_dev_proposal_id: proposal.id,
    gap_ids: proposal.gap_ids,
    weakest_axis: proposal.weakest_axis,
    priority: proposal.priority,
    proposed_by: proposal.proposed_by,
    proposed_at: proposal.proposed_at,
    evidence: proposal.evidence,
    proposal_metadata: proposal.metadata,
  }
  if (curriculumArchitectureSlug) {
    provenance['curriculum_architecture_slug'] = curriculumArchitectureSlug
  }

  return `${primary} [bridge: ${JSON.stringify(provenance)}]`
}

/**
 * Derive the `--slug` value used for shelling out to `lesson-factory`
 * pipeline commands. `capability__outcome` form keeps it filesystem-safe.
 *
 * SECURITY — both `capability_slug` and `outcome_slug` originate from
 * `lesson_dev_proposals` rows. A malformed / adversarial row with a value
 * like `../../etc/passwd` would let `createFsIntakeWriter` escape the
 * `lesson-factory/logs/runs/bridge/` directory. To defend against this:
 *   1. lowercase each component, whitelist `[a-z0-9-]`, non-matching
 *      characters become `-`.
 *   2. collapse consecutive `-` and trim leading/trailing `-`.
 *   3. join with the `__` separator, then re-assert the final string
 *      matches `[a-z0-9_-]+` only (defence in depth — a hostile component
 *      that somehow smuggled a forbidden character past step 1 would fail
 *      here and throw).
 *   4. throw if any sanitised component is empty OR the final slug is empty.
 */
const SLUG_COMPONENT_ALLOWED = /[^a-z0-9-]+/g
const SLUG_COLLAPSE_DASH = /-+/g
const SLUG_TRIM_DASH = /^-+|-+$/g
const SLUG_FINAL_SHAPE = /^[a-z0-9_-]+$/

function sanitizeSlugComponent(raw: string): string {
  const lowered = raw.toLowerCase()
  const replaced = lowered.replace(SLUG_COMPONENT_ALLOWED, '-')
  const collapsed = replaced.replace(SLUG_COLLAPSE_DASH, '-')
  return collapsed.replace(SLUG_TRIM_DASH, '')
}

export function deriveLessonFactorySlug(
  proposal: LessonDevProposalInput,
): string {
  const capability = sanitizeSlugComponent(proposal.capability_slug)
  const outcome = sanitizeSlugComponent(proposal.outcome_slug)
  if (capability.length === 0) {
    throw new Error(
      `deriveLessonFactorySlug: capability_slug sanitised to empty string (raw=${JSON.stringify(proposal.capability_slug)}). Refusing to produce an unsafe filesystem path.`,
    )
  }
  if (outcome.length === 0) {
    throw new Error(
      `deriveLessonFactorySlug: outcome_slug sanitised to empty string (raw=${JSON.stringify(proposal.outcome_slug)}). Refusing to produce an unsafe filesystem path.`,
    )
  }
  const final = `${capability}__${outcome}`
  // Defence in depth — reject anything outside the final whitelist even
  // though component sanitisation should already guarantee compliance.
  if (!SLUG_FINAL_SHAPE.test(final)) {
    throw new Error(
      `deriveLessonFactorySlug: final slug ${JSON.stringify(final)} contains characters outside [a-z0-9_-]. Refusing to produce an unsafe filesystem path.`,
    )
  }
  return final
}
