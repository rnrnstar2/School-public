import path from 'node:path'

import { createRunContext, writeStageError, writeStageMeta, writeStageOutput } from '../core/run-log.js'
import { toRepoRelativePath } from '../core/paths.js'
import type { Asset, LessonDraft, PipelineExecutionOptions, PipelineResult } from '../core/types.js'
import { getImageAdapter, getVideoAdapter } from '../adapters/registry.js'
import {
  findSlotForBrief,
  loadStructuredInput,
  parseLessonFromDraft,
  readStagePrompt,
  validateAssets,
  validateLessonDraft,
} from './shared.js'

export async function runMediaPipeline(
  draftInput: string | LessonDraft,
  options: PipelineExecutionOptions = {},
): Promise<PipelineResult<Asset[]>> {
  const context = createRunContext('media', options.runId)

  try {
    const draft = await validateLessonDraft(await loadStructuredInput(draftInput))
    const lesson = await parseLessonFromDraft(draft)
    const instruction = await readStagePrompt('media')
    const imageAdapter = getImageAdapter()
    const videoAdapter = getVideoAdapter()
    const assets: Asset[] = []

    for (const [index, brief] of draft.image_briefs.entries()) {
      const slot = findSlotForBrief(brief, lesson.media_slots, index)
      const relativePath = `lesson-factory/assets/images/${lesson.id}.${slot}.svg`
      assets.push(
        await imageAdapter.generate({
          run_id: context.runId,
          lesson_id: lesson.id,
          slot,
          prompt: brief,
          output_path: relativePath,
          instruction,
          dry_run: options.dryRun,
        }),
      )
    }

    for (const [index, brief] of draft.video_briefs.entries()) {
      const slot = findSlotForBrief(brief, lesson.media_slots, draft.image_briefs.length + index)
      const relativePath = `lesson-factory/assets/videos/${lesson.id}.${slot}.txt`
      assets.push(
        await videoAdapter.generate(
          {
            lesson_id: lesson.id,
            slot,
            prompt: brief,
            output_path: relativePath,
            dry_run: options.dryRun,
          },
          {
            format: path.extname(relativePath).replace('.', '') || 'txt',
            duration_seconds: 45,
          },
        ),
      )
    }

    const validatedAssets = await validateAssets(assets)
    const normalizedAssets = validatedAssets.map((asset) => ({
      ...asset,
      file_path: path.isAbsolute(asset.file_path)
        ? toRepoRelativePath(asset.file_path)
        : asset.file_path,
    }))
    const outputPath = await writeStageOutput(context, 'json', normalizedAssets, options.dryRun)
    const metaPath = await writeStageMeta(
      context,
      {
        lesson_id: lesson.id,
        asset_count: normalizedAssets.length,
        output_path: outputPath ?? null,
      },
      options.dryRun,
    )

    return {
      output: normalizedAssets,
      outputPath,
      metaPath,
      context,
    }
  } catch (error) {
    await writeStageError(context, error, options.dryRun)
    throw error
  }
}
