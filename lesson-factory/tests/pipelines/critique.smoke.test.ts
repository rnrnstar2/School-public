import { access } from 'node:fs/promises'

import { runCritiquePipeline } from '../../src/pipelines/critique.js'
import { fixturePath, withTempLessonFactory } from '../helpers.js'

describe('critique pipeline', () => {
  it('generates a validated critique bundle with the mock adapter', async () => {
    await withTempLessonFactory(async () => {
      const result = await runCritiquePipeline(fixturePath('lesson-draft.sample.json'), {
        adapterName: 'mock',
      })

      expect(['accept', 'revise']).toContain(result.output.recommend_status)
      expect(result.outputPath).toMatch(/-critique\.json$/)
      await access(result.outputPath!)
    })
  })
})
