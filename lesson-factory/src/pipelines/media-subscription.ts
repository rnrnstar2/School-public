import { access, copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createRunContext, writeStageMeta, writeStageOutput } from '../core/run-log.js'
import {
  createStageArtifactPath,
  fromRepoRelativePath,
  getRunsLogDir,
  toRepoRelativePath,
} from '../core/paths.js'
import type {
  Asset,
  LessonDraft,
  PipelineExecutionOptions,
  PipelineResult,
  SubscriptionImagegenJob,
  SubscriptionImagegenQueue,
} from '../core/types.js'
import {
  findSlotForBrief,
  loadStructuredInput,
  parseLessonFromDraft,
  validateAssets,
  validateLessonDraft,
} from './shared.js'

export interface SubscriptionQueueResult extends PipelineResult<SubscriptionImagegenQueue> {
  guidePath?: string
}

export interface SubscriptionImportOptions extends PipelineExecutionOptions {
  allowMissing?: boolean
}

export async function createSubscriptionImagegenQueue(
  draftInput: string | LessonDraft,
  options: PipelineExecutionOptions = {},
): Promise<SubscriptionQueueResult> {
  const context = createRunContext('media', options.runId)
  const draft = await validateLessonDraft(await loadStructuredInput(draftInput))
  const lesson = await parseLessonFromDraft(draft)
  const reservations = new Map<string, number>()
  const jobs: SubscriptionImagegenJob[] = []

  for (const [index, brief] of draft.image_briefs.entries()) {
    const slot = findSlotForBrief(brief, lesson.media_slots, index)
    const target = await reserveImageTarget(lesson.id, slot, reservations)
    jobs.push({
      job_id: `imagegen.${lesson.id}.${slot}.${jobs.length + 1}`,
      lesson_id: lesson.id,
      slot,
      brief,
      prompt: buildSubscriptionPrompt(lesson.id, slot, brief, target.target_file_path),
      asset_id: target.asset_id,
      target_file_path: target.target_file_path,
      public_file_path: target.public_file_path,
      mime_type: 'image/png',
    })
  }

  const queue: SubscriptionImagegenQueue = {
    version: 'lesson-media-imagegen-queue/v1',
    run_id: context.runId,
    created_at: new Date().toISOString(),
    lesson_id: lesson.id,
    generator: {
      mode: 'codex-built-in-imagegen',
      api_key_required: false,
      subscription_required: true,
    },
    instructions: [
      'Use Codex/ChatGPT built-in image generation from the signed-in subscription plan.',
      'Do not use OPENAI_API_KEY, Image API, or the imagegen fallback CLI.',
      'Generate one image per job prompt.',
      'After each generation, move or copy the selected PNG to target_file_path.',
      'Run lesson:media:import with this queue file after all target files exist.',
    ],
    jobs,
    skipped_video_briefs: draft.video_briefs,
  }

  const outputPath = await writeQueue(context, queue, options.dryRun)
  const guidePath = await writeGuide(context, queue, options.dryRun)
  const metaPath = await writeStageMeta(
    context,
    {
      lesson_id: lesson.id,
      mode: queue.generator.mode,
      api_key_required: false,
      job_count: jobs.length,
      skipped_video_brief_count: draft.video_briefs.length,
      output_path: outputPath ?? null,
      guide_path: guidePath ?? null,
    },
    options.dryRun,
  )

  return {
    output: queue,
    outputPath,
    guidePath,
    metaPath,
    context,
  }
}

export async function importSubscriptionImagegenAssets(
  queueInput: string | SubscriptionImagegenQueue,
  options: SubscriptionImportOptions = {},
): Promise<PipelineResult<Asset[]>> {
  const context = createRunContext('media', options.runId)
  const queue = normalizeQueue(await loadStructuredInput(queueInput))
  const queuePath = typeof queueInput === 'string' ? toRepoRelativePath(path.resolve(queueInput)) : null
  const assets: Asset[] = []
  const missingJobs: SubscriptionImagegenJob[] = []

  for (const job of queue.jobs) {
    const targetAbsolutePath = fromRepoRelativePath(job.target_file_path)

    if (!(await fileExists(targetAbsolutePath))) {
      missingJobs.push(job)
      continue
    }

    if (!options.dryRun) {
      const publicAbsolutePath = fromRepoRelativePath(job.public_file_path)
      await mkdir(path.dirname(publicAbsolutePath), { recursive: true })
      await copyFile(targetAbsolutePath, publicAbsolutePath)
    }

    assets.push({
      asset_id: job.asset_id,
      type: 'image',
      source_adapter: 'codex-imagegen-subscription',
      source_model: 'codex-built-in-imagegen',
      prompt_used: job.prompt,
      file_path: job.target_file_path,
      metadata: {
        lesson_id: job.lesson_id,
        slot: job.slot,
        mime_type: job.mime_type,
        public_file_path: job.public_file_path,
        queue_job_id: job.job_id,
        queue_path: queuePath,
        api_key_required: false,
        subscription_required: true,
      },
      created_at: new Date().toISOString(),
    })
  }

  if (missingJobs.length > 0 && !options.allowMissing) {
    throw new Error(
      [
        `Missing ${missingJobs.length} generated image file(s).`,
        ...missingJobs.map((job) => `- ${job.job_id}: ${job.target_file_path}`),
        'Generate the missing images with Codex built-in imagegen, or pass --allow-missing.',
      ].join('\n'),
    )
  }

  const validatedAssets = await validateAssets(assets)
  const outputPath = await writeStageOutput(context, 'json', validatedAssets, options.dryRun)
  const metaPath = await writeStageMeta(
    context,
    {
      lesson_id: queue.lesson_id,
      mode: queue.generator.mode,
      api_key_required: false,
      asset_count: validatedAssets.length,
      missing_count: missingJobs.length,
      queue_path: queuePath,
      output_path: outputPath ?? null,
    },
    options.dryRun,
  )

  return {
    output: validatedAssets,
    outputPath,
    metaPath,
    context,
  }
}

async function reserveImageTarget(
  lessonId: string,
  slot: string,
  reservations: Map<string, number>,
): Promise<{
  asset_id: string
  target_file_path: string
  public_file_path: string
}> {
  const key = `${lessonId}:${slot}`
  let iteration = (reservations.get(key) ?? 0) + 1

  while (await fileExists(fromRepoRelativePath(buildTargetFilePath(lessonId, slot, iteration)))) {
    iteration += 1
  }

  reservations.set(key, iteration)

  return {
    asset_id: buildAssetId(lessonId, slot, iteration),
    target_file_path: buildTargetFilePath(lessonId, slot, iteration),
    public_file_path: buildPublicFilePath(lessonId, slot, iteration),
  }
}

function buildTargetFilePath(lessonId: string, slot: string, iteration: number): string {
  return path
    .join('lesson-factory', 'assets', 'images', lessonId, `${slot}${buildSuffix(iteration)}.png`)
    .replace(/\\/g, '/')
}

function buildPublicFilePath(lessonId: string, slot: string, iteration: number): string {
  return path
    .join('apps', 'web', 'public', 'lesson-assets', lessonId, `${slot}${buildSuffix(iteration)}.png`)
    .replace(/\\/g, '/')
}

function buildAssetId(lessonId: string, slot: string, iteration: number): string {
  return `asset.${lessonId.replace(/^atom\./, '')}.${slot.replaceAll('_', '-')}${buildSuffix(iteration)}`
}

function buildSuffix(iteration: number): string {
  return iteration === 1 ? '' : `.${iteration}`
}

function buildSubscriptionPrompt(lessonId: string, slot: string, brief: string, targetPath: string): string {
  return [
    'Use case: scientific-educational',
    'Asset type: School lesson inline image',
    `Primary request: ${brief}`,
    `Lesson ID: ${lessonId}`,
    `Slot: ${slot}`,
    'Style/medium: polished educational bitmap, clean UI/diagram style, suitable for a Japanese learning app',
    'Composition/framing: 16:9 landscape, clear hierarchy, generous margins, readable at lesson-card scale',
    'Text: avoid in-image text unless the brief explicitly requires exact text; do not invent UI copy',
    'Constraints: no logos, no watermarks, no trademarks, no photorealistic private data, no broken or unreadable text',
    `After generation: save the selected PNG to ${targetPath}`,
  ].join('\n')
}

async function writeQueue(
  context: { timestamp: string },
  queue: SubscriptionImagegenQueue,
  dryRun = false,
): Promise<string | undefined> {
  const outputPath = createStageArtifactPath(context.timestamp, 'media', 'json', '-imagegen-queue')
  if (dryRun) {
    return undefined
  }

  await mkdir(getRunsLogDir(), { recursive: true })
  await writeFile(outputPath, JSON.stringify(queue, null, 2), 'utf8')
  return outputPath
}

async function writeGuide(
  context: { timestamp: string },
  queue: SubscriptionImagegenQueue,
  dryRun = false,
): Promise<string | undefined> {
  const outputPath = createStageArtifactPath(context.timestamp, 'media', 'md', '-imagegen-guide')
  if (dryRun) {
    return undefined
  }

  const markdown = [
    `# Codex Subscription Imagegen Queue: ${queue.lesson_id}`,
    '',
    'Use Codex/ChatGPT built-in image generation. Do not use OPENAI_API_KEY or the Image API fallback CLI.',
    '',
    ...queue.jobs.flatMap((job, index) => [
      `## ${index + 1}. ${job.slot}`,
      '',
      'Prompt:',
      '',
      '```text',
      job.prompt,
      '```',
      '',
      `Save to: \`${job.target_file_path}\``,
      '',
    ]),
    queue.skipped_video_briefs.length > 0
      ? `Skipped video briefs: ${queue.skipped_video_briefs.length}`
      : '',
  ].filter(Boolean).join('\n')

  await mkdir(getRunsLogDir(), { recursive: true })
  await writeFile(outputPath, markdown, 'utf8')
  return outputPath
}

function normalizeQueue(input: unknown): SubscriptionImagegenQueue {
  const queue = input as SubscriptionImagegenQueue

  if (
    queue?.version !== 'lesson-media-imagegen-queue/v1' ||
    queue.generator?.mode !== 'codex-built-in-imagegen' ||
    !Array.isArray(queue.jobs)
  ) {
    throw new Error('Invalid Codex subscription imagegen queue file.')
  }

  return queue
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}
