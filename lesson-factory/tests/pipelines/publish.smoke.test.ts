import path from 'node:path'
import { access } from 'node:fs/promises'

import { runEvalPipeline } from '../../src/pipelines/eval.js'
import { runPublishPipeline } from '../../src/pipelines/publish.js'
import { fixturePath, withTempLessonFactory } from '../helpers.js'

describe('publish pipeline', () => {
  it('respects dry-run and never promotes to stable', async () => {
    await withTempLessonFactory(async ({ lessonFactoryRoot }) => {
      const evalResult = await runEvalPipeline(
        fixturePath('lesson-draft.sample.json'),
        fixturePath('critique.sample.json'),
      )
      const lessonTarget = path.join(
        lessonFactoryRoot,
        'lessons',
        'atoms',
        'atom.mock.publish-ready.yaml',
      )

      const result = await runPublishPipeline(
        fixturePath('lesson-draft.sample.json'),
        evalResult.output,
        {
          dryRun: true,
          confirmed: true,
        },
      )

      expect(result.output.suggested_status).not.toBe('stable')
      await expect(access(lessonTarget)).rejects.toThrow()
    })
  })
})
