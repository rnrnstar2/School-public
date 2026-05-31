import { access } from 'node:fs/promises'

import { runEvalPipeline } from '../../src/pipelines/eval.js'
import { fixturePath, withTempLessonFactory } from '../helpers.js'

describe('eval pipeline', () => {
  it('returns a reviewed_candidate bundle for the baseline fixtures', async () => {
    await withTempLessonFactory(async () => {
      const result = await runEvalPipeline(
        fixturePath('lesson-draft.sample.json'),
        fixturePath('critique.sample.json'),
      )

      expect(result.output.recommend_status).toBe('reviewed_candidate')
      expect(result.outputPath).toMatch(/-eval\.json$/)
      await access(result.outputPath!)
    })
  })
})
