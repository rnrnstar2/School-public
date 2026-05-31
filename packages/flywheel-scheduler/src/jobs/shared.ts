import type {
  JobEffect,
  JobExecutionContext,
  SchedulerDecisionCandidate,
  SchedulerJobHandler,
  SchedulerJobName,
} from '../types'

export interface StubJobAdapter {
  collect(context: JobExecutionContext): Promise<{
    summary?: JobEffect['summary']
    decisions?: SchedulerDecisionCandidate[]
  }>
}

export function createStubJob(
  jobName: SchedulerJobName,
  adapter: StubJobAdapter,
): SchedulerJobHandler {
  return {
    jobName,
    async run(context) {
      const result = await adapter.collect(context)
      return {
        summary: result.summary ?? { collected: 0 },
        decisions: result.decisions ?? [],
      }
    },
  }
}
