import { access } from 'node:fs/promises'

import { runDraftPipeline } from '../../src/pipelines/draft.js'
import { fixturePath, withTempLessonFactory } from '../helpers.js'

describe('draft pipeline', () => {
  it('generates a mock lesson draft that passes schema validation', async () => {
    await withTempLessonFactory(async () => {
      const result = await runDraftPipeline(fixturePath('intake-bundle.sample.yaml'), {
        adapterName: 'mock',
      })

      expect(result.output.lesson_yaml).toContain('status: draft')
      expect(result.outputPath).toMatch(/-draft\.json$/)
      await access(result.outputPath!)
    })
  })
})
