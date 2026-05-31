#!/usr/bin/env node

import {
  RealPrWorker,
  createGapScanJob,
  createJudgeRunJob,
  createMatcherSweepJob,
  createNightlyDigestJob,
  createSupabaseNightlyDigestRepository,
  createProposerRunJob,
  createSupabaseSchedulerStore,
  executeSchedulerJob,
  loadNightlyWorkflowDefinition,
  resolveSchedulerCronConfig,
  schedulerJobNames,
  type PrWorker,
  type SchedulerJobHandler,
  type SchedulerJobName,
  type SchedulerStore,
} from '../src/index'

function resolveJob(
  jobName: SchedulerJobName,
  store: SchedulerStore,
  prWorker: PrWorker,
): SchedulerJobHandler {
  switch (jobName) {
    case 'matcher_sweep':
      return createMatcherSweepJob()
    case 'gap_scan':
      return createGapScanJob()
    case 'proposer_run':
      return createProposerRunJob()
    case 'judge_run':
      return createJudgeRunJob()
    case 'nightly_digest':
      return createNightlyDigestJob({
        store,
        repository: createSupabaseNightlyDigestRepository(),
        workflow: loadNightlyWorkflowDefinition(),
        prWorker,
      })
  }
}

function printUsage() {
  process.stdout.write(
    [
      'Usage: tsx packages/flywheel-scheduler/bin/run.ts --job <job_name>',
      '       tsx packages/flywheel-scheduler/bin/run.ts --list-cron',
      '',
      `Valid jobs: ${schedulerJobNames.join(', ')}`,
      '',
    ].join('\n'),
  )
}

async function main() {
  const args = process.argv.slice(2)
  const jobFlag = args.indexOf('--job')
  const listFlag = args.includes('--list-cron')

  const cronConfig = resolveSchedulerCronConfig()

  if (listFlag) {
    for (const jobName of schedulerJobNames) {
      process.stdout.write(
        `${jobName}: ${cronConfig.jobs[jobName].schedule} (${cronConfig.timezone})\n`,
      )
    }
    return
  }

  if (jobFlag === -1 || !args[jobFlag + 1]) {
    printUsage()
    process.exitCode = 1
    return
  }

  const candidate = args[jobFlag + 1]
  if (!schedulerJobNames.includes(candidate as SchedulerJobName)) {
    printUsage()
    process.exitCode = 1
    return
  }

  const jobName = candidate as SchedulerJobName
  const store = createSupabaseSchedulerStore()
  const prWorker = new RealPrWorker()
  const job = resolveJob(jobName, store, prWorker)
  const result = await executeSchedulerJob(job, store, {
    triggeredBy: 'manual_cli',
    cronExpression: cronConfig.jobs[jobName].schedule,
    prWorker,
  })

  process.stdout.write(
    JSON.stringify(
      {
        exitCode: result.exitCode,
        jobName,
        runId: result.run.runId,
        status: result.run.status,
        decisions: result.decisions.length,
        errorMessage: result.errorMessage,
      },
      null,
      2,
    ) + '\n',
  )
  process.exitCode = result.exitCode
}

void main()
