import { describe, expect, it } from 'vitest'
import path from 'path'

import { runDocsDrift } from '../check'
import type { Rule } from '../types'

describe('docs-drift runner', () => {
  it('aggregates results across rules and produces a parseable JSON report', async () => {
    const fakeRules: Rule[] = [
      {
        id: 'always-pass',
        description: 'fixture',
        run: () => [],
      },
      {
        id: 'always-fail',
        description: 'fixture',
        run: () => [
          { message: 'boom' },
          { message: 'bam', severity: 'warn' as const },
        ],
      },
    ]

    const { report, json, summaryLine } = await runDocsDrift({
      rootDir: process.cwd(),
      rules: fakeRules,
    })

    expect(report.summary).toEqual({
      rulesTotal: 2,
      rulesFailed: 1,
      findingsTotal: 2,
    })
    expect(summaryLine).toBe('drift detected: 1 rules failed, 2 findings')

    // JSON must round-trip.
    const parsed = JSON.parse(json)
    expect(parsed.rules).toHaveLength(2)
    expect(parsed.rules[0].status).toBe('pass')
    expect(parsed.rules[1].status).toBe('fail')
  })

  it('respects the ruleFilter arg', async () => {
    const fakeRules: Rule[] = [
      { id: 'alpha', description: '', run: () => [{ message: 'a' }] },
      { id: 'beta', description: '', run: () => [{ message: 'b' }] },
    ]
    const { report } = await runDocsDrift({
      rootDir: process.cwd(),
      rules: fakeRules,
      ruleFilter: ['beta'],
    })
    expect(report.rules).toHaveLength(1)
    expect(report.rules[0].id).toBe('beta')
  })

  it('catches thrown errors inside a rule and surfaces them as warn findings', async () => {
    const fakeRules: Rule[] = [
      {
        id: 'boom',
        description: '',
        run: () => {
          throw new Error('explode')
        },
      },
    ]
    const { report } = await runDocsDrift({
      rootDir: process.cwd(),
      rules: fakeRules,
    })
    expect(report.rules[0].status).toBe('fail')
    expect(report.rules[0].findings[0].message).toMatch(/explode/)
  })

  it('still exits with summary 0 failures when the registry is empty', async () => {
    const { report, summaryLine } = await runDocsDrift({
      rootDir: process.cwd(),
      rules: [],
    })
    expect(report.summary).toEqual({
      rulesTotal: 0,
      rulesFailed: 0,
      findingsTotal: 0,
    })
    expect(summaryLine).toBe('drift detected: 0 rules failed, 0 findings')
  })

  it('runs the real default registry against the repo root without throwing', async () => {
    const rootDir = path.resolve(__dirname, '..', '..', '..')
    const { report, summaryLine } = await runDocsDrift({ rootDir })
    expect(report.rules.length).toBe(3)
    expect(summaryLine).toMatch(/drift detected: \d+ rules failed, \d+ findings/)
  })
})
