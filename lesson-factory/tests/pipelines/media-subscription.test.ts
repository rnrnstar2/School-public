import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { LessonDraft } from '../../src/core/types.js'
import {
  createSubscriptionImagegenQueue,
  importSubscriptionImagegenAssets,
} from '../../src/pipelines/media-subscription.js'
import { withTempLessonFactory } from '../helpers.js'

describe('subscription imagegen media flow', () => {
  it('creates a Codex built-in imagegen queue without requiring an API key', async () => {
    await withTempLessonFactory(async () => {
      const result = await createSubscriptionImagegenQueue(buildDraft())

      expect(result.output.generator).toEqual({
        mode: 'codex-built-in-imagegen',
        api_key_required: false,
        subscription_required: true,
      })
      expect(result.output.jobs).toHaveLength(2)
      expect(result.output.jobs[0]?.target_file_path).toBe(
        'lesson-factory/assets/images/atom.test.subscription-media/diagram.png',
      )
      expect(result.output.jobs[0]?.prompt).toContain('After generation')
      expect(result.output.instructions.join('\n')).toContain('Do not use OPENAI_API_KEY')
      expect(result.output.skipped_video_briefs).toEqual(['video_walkthrough slot: not in scope'])
      expect(result.outputPath).toMatch(/-media-imagegen-queue\.json$/)
      expect(result.guidePath).toMatch(/-media-imagegen-guide\.md$/)
    })
  })

  it('imports generated subscription images into Asset[] and mirrors public copies', async () => {
    await withTempLessonFactory(async ({ repoRoot }) => {
      const queueResult = await createSubscriptionImagegenQueue(buildDraft())
      const pngBytes = Buffer.from('fake-png')

      for (const job of queueResult.output.jobs) {
        const targetPath = path.join(repoRoot, job.target_file_path)
        await mkdir(path.dirname(targetPath), { recursive: true })
        await writeFile(targetPath, pngBytes)
      }

      const importResult = await importSubscriptionImagegenAssets(queueResult.output)

      expect(importResult.output).toHaveLength(2)
      expect(importResult.output[0]?.source_adapter).toBe('codex-imagegen-subscription')
      expect(importResult.output[0]?.source_model).toBe('codex-built-in-imagegen')
      expect(importResult.output[0]?.metadata).toMatchObject({
        api_key_required: false,
        subscription_required: true,
      })

      for (const job of queueResult.output.jobs) {
        await expect(readFile(path.join(repoRoot, job.public_file_path))).resolves.toEqual(pngBytes)
      }
    })
  })
})

function buildDraft(): LessonDraft {
  return {
    lesson_yaml: [
      'id: atom.test.subscription-media',
      'title: Subscription Media Flow',
      'persona_tags: [web-builder]',
      'goal_tags: [media]',
      'capability_inputs: [draft-ready]',
      'capability_outputs: [tracked-media-assets]',
      'hard_prerequisites: []',
      'soft_prerequisites: []',
      'deliverable:',
      '  type: markdown_doc',
      '  validation: owner_local_review_v1',
      'evidence: [url]',
      'media_slots: [diagram, screen_capture]',
      'freshness_sources: []',
      'status: draft',
      '',
    ].join('\n'),
    body_markdown: '# Subscription Media Flow',
    image_briefs: [
      'diagram slot: Show the subscription image generation workflow.',
      'screen_capture slot: Show the saved asset path after generation.',
    ],
    video_briefs: ['video_walkthrough slot: not in scope'],
    eval_cases: ['Asset queue can be created'],
    anticipated_blockers: ['Using an API key by mistake'],
    pr_summary: 'Prepare subscription media flow',
  }
}
