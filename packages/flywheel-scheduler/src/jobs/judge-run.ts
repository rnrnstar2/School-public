import { createStubJob, type StubJobAdapter } from './shared'

const defaultAdapter: StubJobAdapter = {
  async collect() {
    return {
      summary: {
        judged_items: 0,
        note: 'TODO(G2A-012): wire judge run to @school/goal-action-judge.',
      },
      decisions: [],
    }
  },
}

export function createJudgeRunJob(adapter: StubJobAdapter = defaultAdapter) {
  return createStubJob('judge_run', adapter)
}
