import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveSchedulerCronConfig } from '../src/scheduler/cron.js'

describe('cron config resolution', () => {
  it('falls back to the 02:00 JST baseline when no config exists', () => {
    const config = resolveSchedulerCronConfig({
      SCHEDULER_CONFIG_PATH: join(tmpdir(), 'missing-scheduler.yaml'),
    } as NodeJS.ProcessEnv)

    expect(config.timezone).toBe('Asia/Tokyo')
    expect(config.defaultSchedule).toBe('0 2 * * *')
    expect(config.jobs.matcher_sweep.schedule).toBe('0 2 * * *')
    expect(config.jobs.nightly_digest.schedule).toBe('0 2 * * *')
  })

  it('lets YAML and env vars override the baseline', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'scheduler-config-'))
    const configPath = join(tempDir, 'scheduler.yaml')
    writeFileSync(
      configPath,
      [
        'timezone: UTC',
        'defaultSchedule: "15 1 * * *"',
        'jobs:',
        '  proposer_run:',
        '    schedule: "30 3 * * *"',
        '',
      ].join('\n'),
    )

    const config = resolveSchedulerCronConfig(
      {
        SCHEDULER_CONFIG_PATH: configPath,
        SCHEDULER_TIMEZONE: 'Asia/Tokyo',
        SCHEDULER_CRON_PROPOSER_RUN: '45 4 * * *',
      } as NodeJS.ProcessEnv,
      configPath,
    )

    expect(config.timezone).toBe('Asia/Tokyo')
    expect(config.jobs.matcher_sweep.schedule).toBe('15 1 * * *')
    expect(config.jobs.proposer_run.schedule).toBe('45 4 * * *')
  })
})
