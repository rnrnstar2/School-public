import type {
  Asset,
  EvalBundle,
  LessonDraft,
  PersonaDefinition,
  PipelineExecutionOptions,
  PipelineResult,
  RubricDefinition,
} from '../core/types.js'
import { createRunContext, writeStageError, writeStageMeta, writeStageOutput } from '../core/run-log.js'
import {
  extractTraceFromBody,
  loadPersonas,
  loadRubrics,
  loadStructuredInput,
  parseLessonFromDraft,
  validateCritique,
  validateEvalBundle,
  validateLessonDraft,
} from './shared.js'

export async function runEvalPipeline(
  draftInput: string | LessonDraft,
  critiqueInput: string | import('../core/types.js').Critique,
  options: PipelineExecutionOptions & { assets?: Asset[] } = {},
): Promise<PipelineResult<EvalBundle>> {
  const context = createRunContext('eval', options.runId)

  try {
    const draft = await validateLessonDraft(await loadStructuredInput(draftInput))
    const critique = await validateCritique(await loadStructuredInput(critiqueInput))
    const lesson = await parseLessonFromDraft(draft)
    const rubrics = await loadRubrics()
    const personas = await loadPersonas()
    const assets = options.assets ?? []
    const trace = extractTraceFromBody(draft.body_markdown)
    const schemaViolations: string[] = []

    if (critique.lesson_id !== lesson.id) {
      schemaViolations.push(`critique.lesson_id mismatch: expected ${lesson.id}, received ${critique.lesson_id}`)
    }

    if (lesson.media_slots.length > 0 && assets.length === 0) {
      schemaViolations.push('media_slots declared but no assets were provided to eval')
    }

    const rubric = selectRubric(rubrics)
    const pedagogyScore = computePedagogyScore(draft, critique, rubric)
    const pedagogyComments = buildPedagogyComments(draft, critique, rubric)
    const failedSteps = critique.issues
      .filter((issue) => issue.severity === 'high' || issue.severity === 'critical')
      .map((issue) => `${issue.location}: ${issue.message}`)

    if (trace.length === 0) {
      failedSteps.push('body_markdown does not contain numbered steps or secondary headings')
    }

    const personaStuckPoints = buildPersonaSimulation({
      draft,
      trace,
      personas,
      rubric,
    })

    const bundle = await validateEvalBundle({
      schema_eval: {
        status: schemaViolations.length === 0 ? 'pass' : 'fail',
        violations: schemaViolations,
      },
      pedagogy_eval: {
        status:
          rubric && pedagogyScore >= rubric.pedagogy_pass_score && pedagogyComments.length > 0
            ? 'pass'
            : 'fail',
        score: pedagogyScore,
        comments: pedagogyComments,
      },
      execution_eval: {
        status: failedSteps.length === 0 ? 'pass' : 'fail',
        trace,
        failed_steps: failedSteps,
      },
      persona_simulation: {
        status:
          personaStuckPoints.length >= (rubric?.persona_count.min ?? 3) &&
          personaStuckPoints.length <= (rubric?.persona_count.max ?? 5)
            ? 'pass'
            : 'fail',
        stuck_points: personaStuckPoints,
      },
      recommend_status: 'revise',
      status_rationale: '',
    })

    const statuses = [
      bundle.schema_eval.status,
      bundle.pedagogy_eval.status,
      bundle.execution_eval.status,
      bundle.persona_simulation.status,
    ]
    bundle.recommend_status = statuses.every((status) => status === 'pass')
      ? 'reviewed_candidate'
      : 'revise'
    bundle.status_rationale =
      bundle.recommend_status === 'reviewed_candidate'
        ? '4観点すべて pass。Owner review に進めるが stable 自動昇格は行わない。'
        : 'At least one evaluation dimension failed. Revise before publish.'

    const outputPath = await writeStageOutput(context, 'json', bundle, options.dryRun)
    const metaPath = await writeStageMeta(
      context,
      {
        lesson_id: lesson.id,
        output_path: outputPath ?? null,
        recommend_status: bundle.recommend_status,
      },
      options.dryRun,
    )

    return {
      output: bundle,
      outputPath,
      metaPath,
      context,
    }
  } catch (error) {
    await writeStageError(context, error, options.dryRun)
    throw error
  }
}

function selectRubric(rubrics: RubricDefinition[]): RubricDefinition | null {
  return rubrics[0] ?? null
}

function computePedagogyScore(
  draft: LessonDraft,
  critique: import('../core/types.js').Critique,
  rubric: RubricDefinition | null,
): number {
  if (!rubric) {
    return 0
  }

  let score = 5
  if (!draft.body_markdown.includes('##')) {
    score -= 1
  }
  if (draft.eval_cases.length === 0) {
    score -= 1
  }
  if (critique.recommend_status !== 'accept') {
    score -= 1
  }
  if (critique.issues.some((issue) => issue.severity === 'high' || issue.severity === 'critical')) {
    score -= 2
  }

  return Math.max(0, Math.min(5, score))
}

function buildPedagogyComments(
  draft: LessonDraft,
  critique: import('../core/types.js').Critique,
  rubric: RubricDefinition | null,
): string[] {
  if (!rubric) {
    return ['No rubric files found in lesson-factory/evals/rubrics/.']
  }

  const comments = [
    draft.eval_cases.length > 0
      ? 'Eval cases are present for downstream verification.'
      : 'Eval cases are missing.',
    critique.issues.length > 0
      ? `Critique surfaced ${critique.issues.length} issue(s); review before publish.`
      : 'Critique did not surface issues.',
  ]

  if (!draft.body_markdown.includes('## Steps') && !draft.body_markdown.includes('## 手順')) {
    comments.push('Add an explicit steps section so the learner flow is easier to follow.')
  }

  return comments
}

function buildPersonaSimulation(input: {
  draft: LessonDraft
  trace: string[]
  personas: PersonaDefinition[]
  rubric: RubricDefinition | null
}): import('../core/types.js').PersonaStuckPoint[] {
  const minimum = input.rubric?.persona_count.min ?? 3
  const maximum = input.rubric?.persona_count.max ?? 5
  const selectedPersonas =
    input.personas.length > 0
      ? input.personas.slice(0, maximum)
      : [
          {
            tag: 'owner-local',
            step_focus: 'Verification',
            default_issue: 'Missing persona data set.',
            default_mitigation: 'Add baseline personas under lesson-factory/evals/personas/.',
          },
        ]

  const output: import('../core/types.js').PersonaStuckPoint[] = []
  for (let index = 0; output.length < minimum; index += 1) {
    const persona = selectedPersonas[index % selectedPersonas.length] ?? selectedPersonas[0]
    if (!persona) {
      break
    }
    const step = input.trace[index % Math.max(input.trace.length, 1)] ?? persona.step_focus
    const blocker = input.draft.anticipated_blockers[index % Math.max(input.draft.anticipated_blockers.length, 1)]
    output.push({
      persona: persona.tag,
      step,
      issue: blocker ?? persona.default_issue,
      mitigation: persona.default_mitigation,
    })
  }

  return output.slice(0, maximum)
}
