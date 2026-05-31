import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

import {
  schedulerJobNames,
  type SchedulerJobName,
} from '../types'

export interface CronJobConfig {
  schedule: string
}

export interface SchedulerCronConfig {
  timezone: string
  defaultSchedule: string
  jobs: Record<SchedulerJobName, CronJobConfig>
}

type RawYamlConfig = {
  timezone?: unknown
  defaultSchedule?: unknown
  jobs?: Record<string, { schedule?: unknown } | undefined>
}

const DEFAULT_TIMEZONE = 'Asia/Tokyo'
const DEFAULT_SCHEDULE = '0 2 * * *'

function normalizeSchedule(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeTimezone(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_TIMEZONE
}

function emptyConfig(): SchedulerCronConfig {
  return {
    timezone: DEFAULT_TIMEZONE,
    defaultSchedule: DEFAULT_SCHEDULE,
    jobs: Object.fromEntries(
      schedulerJobNames.map((jobName) => [jobName, { schedule: DEFAULT_SCHEDULE }]),
    ) as Record<SchedulerJobName, CronJobConfig>,
  }
}

export function loadSchedulerConfigFromYaml(configPath: string): SchedulerCronConfig {
  const absolutePath = resolve(configPath)
  const base = emptyConfig()

  if (!existsSync(absolutePath)) {
    return base
  }

  const parsed = (load(readFileSync(absolutePath, 'utf8')) ?? {}) as RawYamlConfig
  const defaultSchedule = normalizeSchedule(parsed.defaultSchedule, base.defaultSchedule)

  return {
    timezone: normalizeTimezone(parsed.timezone),
    defaultSchedule,
    jobs: Object.fromEntries(
      schedulerJobNames.map((jobName) => [
        jobName,
        {
          schedule: normalizeSchedule(
            parsed.jobs?.[jobName]?.schedule,
            defaultSchedule,
          ),
        },
      ]),
    ) as Record<SchedulerJobName, CronJobConfig>,
  }
}

function envKeyForJob(jobName: SchedulerJobName) {
  return `SCHEDULER_CRON_${jobName.toUpperCase()}`
}

export function resolveSchedulerCronConfig(
  env: NodeJS.ProcessEnv = process.env,
  configPath = env.SCHEDULER_CONFIG_PATH ?? 'config/scheduler.yaml',
): SchedulerCronConfig {
  const yamlConfig = loadSchedulerConfigFromYaml(configPath)
  const defaultSchedule = normalizeSchedule(
    env.SCHEDULER_BASELINE_CRON,
    yamlConfig.defaultSchedule,
  )

  return {
    timezone: normalizeTimezone(env.SCHEDULER_TIMEZONE ?? yamlConfig.timezone),
    defaultSchedule,
    jobs: Object.fromEntries(
      schedulerJobNames.map((jobName) => [
        jobName,
        {
          schedule: normalizeSchedule(
            env[envKeyForJob(jobName)],
            yamlConfig.jobs[jobName]?.schedule ?? defaultSchedule,
          ),
        },
      ]),
    ) as Record<SchedulerJobName, CronJobConfig>,
  }
}
