import { atomFilePathForId, toRepoRelativePath } from '../core/paths.js'
import { writeLessonAtom } from '../core/lesson-store.js'
import { createRunContext, writeStageError, writeStageMeta, writeStageOutput } from '../core/run-log.js'
import type {
  EvalBundle,
  LessonDraft,
  PipelineExecutionOptions,
  PipelineResult,
  PublishBundle,
} from '../core/types.js'
import {
  findLessonAssetPaths,
  loadStructuredInput,
  parseLessonFromDraft,
  validateEvalBundle,
  validateLessonDraft,
  validatePublishBundle,
} from './shared.js'

export async function runPublishPipeline(
  draftInput: string | LessonDraft,
  evalInput: string | EvalBundle,
  options: PipelineExecutionOptions & { confirmed?: boolean } = {},
): Promise<PipelineResult<PublishBundle>> {
  const context = createRunContext('publish', options.runId)

  try {
    if (!options.confirmed) {
      throw new Error('Owner confirmation is required for publish. Re-run with explicit confirmation.')
    }

    const draft = await validateLessonDraft(await loadStructuredInput(draftInput))
    const evalBundle = await validateEvalBundle(await loadStructuredInput(evalInput))
    const lesson = await parseLessonFromDraft(draft)

    if (lesson.status === 'stable') {
      throw new Error('Publish input must not start from stable status.')
    }
    if (evalBundle.recommend_status !== 'reviewed_candidate') {
      throw new Error('Publish requires eval_bundle.recommend_status == reviewed_candidate.')
    }

    const suggestedStatus: PublishBundle['suggested_status'] =
      evalBundle.pedagogy_eval.score >= 4 && evalBundle.execution_eval.failed_steps.length === 0
        ? 'reviewed'
        : 'experimental'

    const lessonToWrite = {
      ...lesson,
      status: suggestedStatus,
    }
    const lessonPath = await writeLessonAtom(lessonToWrite, {
      overwrite: true,
      dryRun: options.dryRun,
      targetPath: atomFilePathForId(lesson.id),
    })
    const assetPaths = await findLessonAssetPaths(lesson.id)
    const unresolvedRisks = [...new Set([
      ...evalBundle.pedagogy_eval.comments.filter((comment) => comment.toLowerCase().includes('add ')),
      ...evalBundle.persona_simulation.stuck_points.map(
        (point) => `${point.persona}: ${point.issue}`,
      ),
    ])]
    const bundle = await validatePublishBundle({
      lesson_id: lesson.id,
      files_to_write: [
        {
          path: toRepoRelativePath(lessonPath),
          source: 'LessonDraft.lesson_yaml',
          notes: `status is pinned to ${suggestedStatus}; stable is never auto-assigned`,
        },
        ...assetPaths.map((assetPath) => ({
          path: toRepoRelativePath(assetPath),
          source: pathSource(assetPath),
          notes: 'Existing generated asset',
        })),
      ],
      pr_summary: `${draft.pr_summary} (${suggestedStatus})`,
      unresolved_risks: unresolvedRisks,
      suggested_status: suggestedStatus,
      owner_review_required: true,
    })
    const outputPath = await writeStageOutput(context, 'json', bundle, options.dryRun)
    const metaPath = await writeStageMeta(
      context,
      {
        lesson_id: lesson.id,
        suggested_status: suggestedStatus,
        lesson_output_path: toRepoRelativePath(lessonPath),
        output_path: outputPath ?? null,
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

function pathSource(assetPath: string): string {
  return assetPath.split('/').pop() ?? assetPath
}
