import { readLessonById } from '../core/lesson-store.js'
import { createRunContext, writeStageError, writeStageMeta, writeStageOutput } from '../core/run-log.js'
import type {
  FreshContextBundle,
  IntakeBundle,
  LessonDraft,
  PipelineExecutionOptions,
  PipelineResult,
} from '../core/types.js'
import { getDraftAdapter, resolveDraftAdapterName } from '../adapters/registry.js'
import { loadStructuredInput, readStagePrompt, validateIntakeBundle, validateLessonDraft } from './shared.js'

export interface DraftPipelineOptions extends PipelineExecutionOptions {
  fresh_context_bundle?: FreshContextBundle
}

export async function runDraftPipeline(
  intakeInput: string | IntakeBundle,
  options: DraftPipelineOptions = {},
): Promise<PipelineResult<LessonDraft>> {
  const context = createRunContext('draft', options.runId)

  try {
    const intakeBundle = await validateIntakeBundle(await loadStructuredInput(intakeInput))
    if (
      intakeBundle.classification !== 'new_atom' &&
      intakeBundle.classification !== 'improve_existing'
    ) {
      throw new Error(
        `Draft stage cannot run for classification ${intakeBundle.classification}. Use intake output only for new_atom or improve_existing.`,
      )
    }

    const relatedExistingAtoms = await Promise.all(
      intakeBundle.related_atom_ids.map((lessonId) => readLessonById(lessonId)),
    )
    const instruction = await readStagePrompt('draft')
    const adapterName = resolveDraftAdapterName(options.adapterName)
    const adapter = getDraftAdapter({
      instruction,
      overrideName: options.adapterName,
    })
    const draft = await validateLessonDraft(
      await adapter.draftLesson({
        run_id: context.runId,
        instruction,
        intake_bundle: intakeBundle,
        related_existing_atoms: relatedExistingAtoms,
        fresh_context_bundle: options.fresh_context_bundle,
        dry_run: options.dryRun,
      }),
    )
    const outputPath = await writeStageOutput(context, 'json', draft, options.dryRun)
    const metaPath = await writeStageMeta(
      context,
      {
        adapter: adapterName,
        classification: intakeBundle.classification,
        lesson_id: relatedExistingAtoms[0]?.id ?? null,
        fresh_context_run_id: options.fresh_context_bundle?.run_id ?? null,
        fresh_context_count: options.fresh_context_bundle?.contexts.length ?? 0,
        output_path: outputPath ?? null,
      },
      options.dryRun,
    )

    return {
      output: draft,
      outputPath,
      metaPath,
      context,
    }
  } catch (error) {
    await writeStageError(context, error, options.dryRun)
    throw error
  }
}
