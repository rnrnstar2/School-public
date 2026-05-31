import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { defaultRubric } from '../src/rubric.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TEST_DIR, '../../../../')
const RUBRIC_PATH = path.join(
  REPO_ROOT,
  'eval-datasets/goal-action/v0/rubric.md',
)

/** Extract the first decimal number found on lines that match `predicate`. */
function extractNumberFromLines(
  lines: string[],
  predicate: (line: string) => boolean,
): number {
  for (const line of lines) {
    if (!predicate(line)) continue
    const match = line.match(/(\d+(?:\.\d+)?)/)
    if (match) {
      return Number.parseFloat(match[1]!)
    }
  }
  throw new Error(
    `rubric parser: no line matched predicate; saw ${lines.length} lines`,
  )
}

describe('defaultRubric', () => {
  it('mirrors the prose thresholds in rubric.md', async () => {
    const raw = await readFile(RUBRIC_PATH, 'utf8')
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // Action normalization: `precision >= 0.90`
    const actionNormalizationPrecision = extractNumberFromLines(lines, (line) =>
      /初期閾値.*precision\s*>=\s*0/i.test(line) &&
      !line.includes('recall') &&
      // First occurrence is the action-normalization bullet.
      lines.indexOf(line) <
        lines.findIndex((l) => /Lesson matching/.test(l)),
    )

    // Lesson matching: `recall@3 >= 0.80`, `precision >= 0.70`
    const matchingBlock = lines.filter((_, index) => {
      const startIdx = lines.findIndex((line) => /Lesson matching/.test(line))
      const endIdx = lines.findIndex(
        (line, i) => i > startIdx && /Gap detection/.test(line),
      )
      return index > startIdx && index < endIdx
    })
    const matcherRecallAt3 = Number.parseFloat(
      matchingBlock
        .find((line) => /recall@3\s*>=\s*/.test(line))!
        .match(/recall@3\s*>=\s*(\d+(?:\.\d+)?)/)![1]!,
    )
    const matcherPrecision = Number.parseFloat(
      matchingBlock
        .find((line) => /precision\s*>=\s*/.test(line))!
        .match(/precision\s*>=\s*(\d+(?:\.\d+)?)/)![1]!,
    )

    // Gap detection: `precision >= 0.80`, `recall >= 0.60`
    const gapBlock = lines.filter((_, index) => {
      const startIdx = lines.findIndex((line) => /Gap detection/.test(line))
      const endIdx = lines.findIndex(
        (line, i) => i > startIdx && /Proposal priority/.test(line),
      )
      return index > startIdx && index < endIdx
    })
    const gapPrecision = Number.parseFloat(
      gapBlock
        .find((line) => /precision\s*>=\s*/.test(line))!
        .match(/precision\s*>=\s*(\d+(?:\.\d+)?)/)![1]!,
    )
    const gapRecall = Number.parseFloat(
      gapBlock
        .find((line) => /recall\s*>=\s*/.test(line))!
        .match(/recall\s*>=\s*(\d+(?:\.\d+)?)/)![1]!,
    )

    // Proposal priority: `agreement >= 0.70`
    const proposerBlock = lines.filter((_, index) => {
      const startIdx = lines.findIndex((line) =>
        /Proposal priority/.test(line),
      )
      const endIdx = lines.findIndex(
        (line, i) => i > startIdx && /Reviewer Notes/.test(line),
      )
      return index > startIdx && (endIdx === -1 || index < endIdx)
    })
    const proposerAgreement = Number.parseFloat(
      proposerBlock
        .find((line) => /agreement\s*>=\s*/.test(line))!
        .match(/agreement\s*>=\s*(\d+(?:\.\d+)?)/)![1]!,
    )

    expect(defaultRubric.actionNormalization.precision).toBe(
      actionNormalizationPrecision,
    )
    expect(defaultRubric.matcher.recallAt3).toBe(matcherRecallAt3)
    expect(defaultRubric.matcher.precision).toBe(matcherPrecision)
    expect(defaultRubric.gap.precision).toBe(gapPrecision)
    expect(defaultRubric.gap.recall).toBe(gapRecall)
    expect(defaultRubric.proposer.agreement).toBe(proposerAgreement)
  })
})
