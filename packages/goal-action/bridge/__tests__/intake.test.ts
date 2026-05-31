import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

// Import lesson-factory's canonical JSON-Schema for the IntakeBundle. This
// is the SAME schema that `lesson-factory/src/pipelines/shared.ts::
// validateIntakeBundle` feeds into Ajv, so round-tripping the bridge payload
// through it here gives us the exact contract assertion the downstream
// `lesson:research` / `lesson:draft` commands will enforce at runtime.
import { intakeBundleSchema } from '../../../../lesson-factory/src/core/types.js'

import {
  buildIntakeBundle,
  deriveLessonFactorySlug,
} from '../src/intake.js'
import {
  LessonDevProposalInputSchema,
  type LessonDevProposalInput,
} from '../src/schema.js'

// Ajv is CommonJS; use createRequire so the ESM vitest transform picks up
// the default export without a bundler hack. Mirrors lesson-factory's own
// schema-validator.ts approach.
const require = createRequire(import.meta.url)
const Ajv2020 = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js')
const addFormats = require('ajv-formats/dist/index.js') as typeof import('ajv-formats/dist/index.js')

const ajv = new Ajv2020.default({
  allErrors: true,
  strict: false,
  validateSchema: false,
})
addFormats.default(ajv)
const validateIntakeBundle = ajv.compile(intakeBundleSchema)

const BASE_PROPOSAL: LessonDevProposalInput = {
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  capability_slug: 'prompt-quality',
  outcome_slug: 'production-ready',
  priority: 'high',
  status: 'approved',
  gap_ids: ['gap-1', 'gap-2'],
  weakest_axis: 'blocker',
  evidence: {
    gapIds: ['gap-1', 'gap-2'],
    weakestAxes: { blocker: 2 },
    candidateLessons: [],
    gapSummaries: [],
  },
  candidate_lesson_slug: null,
  rationale: 'prompts fail QA eval on edge cases',
  proposed_by: 'ai',
  proposed_at: '2026-04-17T10:00:00.000Z',
  metadata: { source: 'gap-detector' },
}

describe('buildIntakeBundle', () => {
  it('produces a bundle that validates against lesson-factory intakeBundleSchema', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    const ok = validateIntakeBundle(bundle)
    // Surface ajv errors so any drift from the lesson-factory contract is
    // visible at a glance when the assertion fails.
    expect(validateIntakeBundle.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })

  it('rejects any extra top-level key (additionalProperties: false contract)', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    const tampered = {
      ...bundle,
      // Emulate the old bridge shape where forbidden top-level keys leaked.
      capability_slug: 'prompt-quality',
    } as unknown
    const ok = validateIntakeBundle(tampered)
    expect(ok).toBe(false)
    const messages = (validateIntakeBundle.errors ?? []).map(
      (e) => e.message ?? '',
    )
    // Ajv reports additionalProperties violations with a "must NOT have
    // additional properties" style message; assert on the keyword so the
    // check is resilient to exact message wording drift.
    const hasAdditional = (validateIntakeBundle.errors ?? []).some(
      (e) => e.keyword === 'additionalProperties',
    )
    expect(hasAdditional).toBe(true)
    // And the error references the offending key.
    expect(messages.join(' ')).toMatch(/additional/i)
  })

  it('emits only the lesson-factory required top-level keys', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    expect(Object.keys(bundle).sort()).toEqual(
      [
        'candidate_capabilities',
        'classification',
        'classification_reason',
        'freshness_signals',
        'goal',
        'related_atom_ids',
        'target_personas',
      ].sort(),
    )
    // Hard-assert that the old bridge-specific top-level keys are gone.
    const tlk = bundle as Record<string, unknown>
    expect(tlk['capability_slug']).toBeUndefined()
    expect(tlk['outcome_slug']).toBeUndefined()
    expect(tlk['priority']).toBeUndefined()
    expect(tlk['metadata']).toBeUndefined()
    expect(tlk['weakest_axis']).toBeUndefined()
    expect(tlk['candidate_lesson_slug']).toBeUndefined()
  })

  it('maps classification + related_atom_ids from the proposal', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    expect(bundle.classification).toBe('new_atom')
    expect(bundle.related_atom_ids).toEqual([])
  })

  it('emits a candidate capability sourced from proposal.capability_slug', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    expect(bundle.candidate_capabilities).toHaveLength(1)
    expect(bundle.candidate_capabilities[0]?.capability).toBe('prompt-quality')
    expect(bundle.candidate_capabilities[0]?.rationale).toBe(
      'prompts fail QA eval on edge cases',
    )
  })

  it('emits a default `learner` target persona with a heuristic reason', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    expect(bundle.target_personas).toHaveLength(1)
    expect(bundle.target_personas[0]?.tag).toBe('learner')
    // Reason explicitly flags the default as a bridge heuristic so Owner
    // reviewers understand it can/should be refined before `lesson:research`.
    expect(bundle.target_personas[0]?.reason).toMatch(/bridge default/i)
  })

  it('derives freshness signals from evidence.source when present AND keeps synthetic default (P1 round 5)', () => {
    const bundle = buildIntakeBundle({
      ...BASE_PROPOSAL,
      evidence: { source: 'supabase/rls' },
    })
    // Real signal derived from evidence.source leads the list.
    expect(bundle.freshness_signals.length).toBeGreaterThanOrEqual(2)
    expect(bundle.freshness_signals[0]?.source).toBe('supabase/rls')
    // Synthetic fallback is still appended so Owner review always has a
    // bridge-derived baseline even when a real signal is present. Synthetic
    // source format: `lesson_dev_proposal:<capability>/<outcome>`.
    const syntheticIdx = bundle.freshness_signals.findIndex((s) =>
      s.source.startsWith('lesson_dev_proposal:'),
    )
    expect(syntheticIdx).toBeGreaterThanOrEqual(0)
    expect(bundle.freshness_signals[syntheticIdx]?.source).toContain(
      'prompt-quality',
    )
    expect(bundle.freshness_signals[syntheticIdx]?.source).toContain(
      'production-ready',
    )
  })

  it('synthesises at least one freshness signal when evidence has no source string (P1 round 5)', () => {
    // goal-action-proposer does NOT emit evidence.source today. The bridge
    // MUST still produce a non-empty freshness_signals array so that the
    // downstream lesson-factory context-fetch pipeline does not throw
    // "intake bundle has no freshness_signals" on the first stage.
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    expect(bundle.freshness_signals.length).toBeGreaterThanOrEqual(1)
    const synthetic = bundle.freshness_signals[0]
    expect(synthetic?.source).toMatch(/^lesson_dev_proposal:/)
    expect(synthetic?.source).toContain('prompt-quality')
    expect(synthetic?.source).toContain('production-ready')
    // Reason carries proposed_at + gap_ids + rationale so Owner reviewers
    // can see what context the synthetic signal was derived from.
    expect(synthetic?.reason).toContain('proposed_at=2026-04-17T10:00:00.000Z')
    expect(synthetic?.reason).toContain('gap_ids=gap-1,gap-2')
    expect(synthetic?.reason).toContain('prompts fail QA eval')
    // Round-trip through the lesson-factory ajv schema to prove the
    // synthesised bundle passes validation (regression: previously `[]`).
    const ok = validateIntakeBundle(bundle)
    expect(validateIntakeBundle.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })

  it('synthetic freshness signal reason falls back gracefully when rationale is null (P1 round 5)', () => {
    const bundle = buildIntakeBundle({
      ...BASE_PROPOSAL,
      rationale: null,
    })
    expect(bundle.freshness_signals.length).toBeGreaterThanOrEqual(1)
    expect(bundle.freshness_signals[0]?.reason).toContain(
      'gap on axis',
    )
    const ok = validateIntakeBundle(bundle)
    expect(validateIntakeBundle.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })

  it('uses rationale as goal.summary when present', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    expect(bundle.goal.summary).toBe('prompts fail QA eval on edge cases')
  })

  it('falls back to a composed summary when rationale is null', () => {
    const bundle = buildIntakeBundle({
      ...BASE_PROPOSAL,
      rationale: null,
    })
    expect(bundle.goal.summary).toContain('prompt-quality')
    expect(bundle.goal.summary).toContain('production-ready')
    expect(bundle.goal.summary).toContain('blocker')
  })

  it('puts weakest_axis and priority into goal.constraints (structured)', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL)
    expect(bundle.goal.constraints).toContain('weakest_axis=blocker')
    expect(bundle.goal.constraints).toContain('priority=high')
  })

  it('classifies as improve_existing when candidate_lesson_slug is set', () => {
    const bundle = buildIntakeBundle({
      ...BASE_PROPOSAL,
      candidate_lesson_slug: 'atom.prompt.quality-basics',
    })
    expect(bundle.classification).toBe('improve_existing')
    expect(bundle.related_atom_ids).toEqual(['atom.prompt.quality-basics'])
    expect(bundle.goal.hints).toContain(
      'candidate_lesson=atom.prompt.quality-basics',
    )
  })

  it('records curriculum architecture slug inside goal.hints', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL, {
      curriculumArchitectureSlug: 'ai-automation',
    })
    expect(bundle.goal.hints).toContain('curriculum_architecture=ai-automation')
  })

  it('preserves proposal provenance inside classification_reason (structured [bridge:] suffix)', () => {
    const bundle = buildIntakeBundle(BASE_PROPOSAL, {
      curriculumArchitectureSlug: 'ai-automation',
    })
    // Primary reason shows the human-readable text first.
    expect(bundle.classification_reason).toMatch(/prompts fail QA eval/)
    // Provenance block is appended as `[bridge: {...json...}]` so the info
    // is machine-parseable without polluting top-level fields (which the
    // lesson-factory schema rejects).
    expect(bundle.classification_reason).toMatch(/\[bridge: /)
    const bridgeMatch = bundle.classification_reason.match(
      /\[bridge:\s*(\{.*\})\]$/,
    )
    expect(bridgeMatch).not.toBeNull()
    const parsed = JSON.parse(bridgeMatch![1]!) as Record<string, unknown>
    expect(parsed['lesson_dev_proposal_id']).toBe(BASE_PROPOSAL.id)
    expect(parsed['gap_ids']).toEqual(['gap-1', 'gap-2'])
    expect(parsed['weakest_axis']).toBe('blocker')
    expect(parsed['priority']).toBe('high')
    expect(parsed['proposed_by']).toBe('ai')
    expect(parsed['proposed_at']).toBe('2026-04-17T10:00:00.000Z')
    expect(parsed['curriculum_architecture_slug']).toBe('ai-automation')
    // Original proposal.metadata survives under proposal_metadata.
    expect(parsed['proposal_metadata']).toEqual({ source: 'gap-detector' })
    // Evidence blob also preserved.
    expect(parsed['evidence']).toEqual(BASE_PROPOSAL.evidence)
  })

  it('composes a classification_reason when rationale is null', () => {
    const bundle = buildIntakeBundle({
      ...BASE_PROPOSAL,
      rationale: null,
    })
    expect(bundle.classification_reason).toMatch(
      /Gap detected on axis 'blocker'/,
    )
    expect(bundle.classification_reason).toContain('prompt-quality')
  })

  it('derives a filesystem-safe slug for lesson-factory', () => {
    expect(deriveLessonFactorySlug(BASE_PROPOSAL)).toBe(
      'prompt-quality__production-ready',
    )
  })

  it('sanitises path-traversal attempts in capability_slug (P2 round 5)', () => {
    const result = deriveLessonFactorySlug({
      ...BASE_PROPOSAL,
      capability_slug: '../../etc/passwd',
      outcome_slug: 'production-ready',
    })
    // No path separators, no dot-dot traversal, no forbidden characters.
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
    // Final whitelist: only [a-z0-9_-] allowed (underscore permitted for
    // the `__` component separator).
    expect(result).toMatch(/^[a-z0-9_-]+$/)
    // Must still contain the outcome half (it wasn't attacked).
    expect(result).toContain('production-ready')
  })

  it('sanitises path-traversal attempts in outcome_slug (P2 round 5)', () => {
    const result = deriveLessonFactorySlug({
      ...BASE_PROPOSAL,
      capability_slug: 'prompt-quality',
      outcome_slug: '../../../../tmp/pwn',
    })
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
    expect(result).toMatch(/^[a-z0-9_-]+$/)
    expect(result).toContain('prompt-quality')
  })

  it('lowercases + collapses dashes on slug components (P2 round 5)', () => {
    const result = deriveLessonFactorySlug({
      ...BASE_PROPOSAL,
      capability_slug: 'Prompt--Quality',
      outcome_slug: 'PRODUCTION___READY',
    })
    expect(result).toMatch(/^[a-z0-9_-]+$/)
    // Consecutive dashes collapsed to single.
    expect(result).not.toMatch(/---/)
    // Lowercased — no uppercase survives.
    expect(result).toBe(result.toLowerCase())
  })

  it('throws when capability_slug sanitises to empty (P2 round 5)', () => {
    expect(() =>
      deriveLessonFactorySlug({
        ...BASE_PROPOSAL,
        capability_slug: '...///',
        outcome_slug: 'production-ready',
      }),
    ).toThrow(/capability_slug sanitised to empty/i)
  })

  it('throws when outcome_slug sanitises to empty (P2 round 5)', () => {
    expect(() =>
      deriveLessonFactorySlug({
        ...BASE_PROPOSAL,
        capability_slug: 'prompt-quality',
        outcome_slug: '../..',
      }),
    ).toThrow(/outcome_slug sanitised to empty/i)
  })

  it('validates through lesson-factory schema after classification override', () => {
    // Sanity-check that every classification variant still validates (the
    // schema enum permits all four values).
    const variants = ['new_atom', 'improve_existing', 'anchor_only', 'unsupported'] as const
    for (const classification of variants) {
      const bundle = buildIntakeBundle(BASE_PROPOSAL, { classification })
      const ok = validateIntakeBundle(bundle)
      expect(validateIntakeBundle.errors ?? []).toEqual([])
      expect(ok).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// LessonDevProposalInputSchema — passthrough behaviour (P1-1)
// ---------------------------------------------------------------------------

describe('LessonDevProposalInputSchema', () => {
  it('passes through DB-only columns such as updated_at without throwing', () => {
    // decision_ledger rows ship extra columns (updated_at, created_at, etc.).
    // The schema must accept them so callers can feed rows in unchanged.
    const raw = {
      ...BASE_PROPOSAL,
      updated_at: '2026-04-17T00:00:00.000Z',
      created_at: '2026-04-16T12:00:00.000Z',
    }
    expect(() => LessonDevProposalInputSchema.parse(raw)).not.toThrow()
    const parsed = LessonDevProposalInputSchema.parse(raw) as Record<
      string,
      unknown
    >
    expect(parsed['updated_at']).toBe('2026-04-17T00:00:00.000Z')
  })

  it('buildIntakeBundle accepts a proposal with extra DB columns (P1-1)', () => {
    // Round-trip through the schema to prove passthrough works end-to-end
    // the way a DB fetcher would: parse unknown-shape row, then feed into
    // the bundle builder without pre-stripping.
    const rawRow = {
      ...BASE_PROPOSAL,
      updated_at: '2026-04-17T00:00:00.000Z',
      created_at: '2026-04-16T12:00:00.000Z',
    } as unknown
    const parsed = LessonDevProposalInputSchema.parse(rawRow)
    const bundle = buildIntakeBundle(parsed)
    // The produced bundle must still pass lesson-factory validation.
    const ok = validateIntakeBundle(bundle)
    expect(validateIntakeBundle.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })
})
