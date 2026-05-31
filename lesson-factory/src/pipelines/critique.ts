import { createRunContext, writeStageError, writeStageMeta, writeStageOutput } from '../core/run-log.js'
import type { LessonDraft, PipelineExecutionOptions, PipelineResult } from '../core/types.js'
import { getCritiqueAdapter, resolveCritiqueAdapterName } from '../adapters/registry.js'
import {
  loadStructuredInput,
  parseLessonFromDraft,
  readStagePrompt,
  validateCritique,
  validateLessonDraft,
} from './shared.js'

export async function runCritiquePipeline(
  draftInput: string | LessonDraft,
  options: PipelineExecutionOptions = {},
): Promise<PipelineResult<import('../core/types.js').Critique>> {
  const context = createRunContext('critique', options.runId)

  try {
    const draft = await validateLessonDraft(await loadStructuredInput(draftInput))
    const lesson = await parseLessonFromDraft(draft)
    const instruction = await readStagePrompt('critique')
    const adapterName = resolveCritiqueAdapterName(options.adapterName)
    const adapter = getCritiqueAdapter({
      instruction,
      overrideName: options.adapterName,
    })
    const critique = await validateCritique(await adapter.critique(draft))

    if (critique.lesson_id !== lesson.id) {
      throw new Error(
        `Critique lesson_id mismatch. Expected ${lesson.id}, received ${critique.lesson_id}.`,
      )
    }

    const outputPath = await writeStageOutput(context, 'json', critique, options.dryRun)
    const metaPath = await writeStageMeta(
      context,
      {
        adapter: adapterName,
        lesson_id: lesson.id,
        output_path: outputPath ?? null,
      },
      options.dryRun,
    )

    return {
      output: critique,
      outputPath,
      metaPath,
      context,
    }
  } catch (error) {
    await writeStageError(context, error, options.dryRun)
    throw error
  }
}
