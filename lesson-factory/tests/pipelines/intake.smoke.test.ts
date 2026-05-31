import { access } from 'node:fs/promises'

import { runIntakePipeline } from '../../src/pipelines/intake.js'
import type { IntakeBundle } from '../../src/core/types.js'
import { withTempLessonFactory } from '../helpers.js'

describe('intake pipeline', () => {
  it('writes a validated intake bundle', async () => {
    const bundle: IntakeBundle = {
      goal: {
        summary: 'Normalize a new owner-local lesson request',
        constraints: ['single capability'],
        hints: ['keep the scope narrow'],
      },
      target_personas: [
        {
          tag: 'web-builder',
          reason: 'Needs a small first-success loop',
        },
      ],
      candidate_capabilities: [
        {
          capability: 'normalize-request',
          rationale: 'This is the concrete output of the intake stage.',
        },
      ],
      freshness_signals: [],
      classification: 'new_atom',
      classification_reason: 'This request creates a new learning atom.',
      related_atom_ids: [],
    }

    await withTempLessonFactory(async () => {
      const result = await runIntakePipeline(bundle)
      expect(result.output.classification).toBe('new_atom')
      expect(result.outputPath).toMatch(/-intake\.yaml$/)
      await access(result.outputPath!)
    })
  })
})
