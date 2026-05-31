import { createStubJob, type StubJobAdapter } from './shared'

const defaultAdapter: StubJobAdapter = {
  async collect() {
    return {
      summary: {
        matcher_candidates: 0,
        note: 'TODO(G2A-012): wire matcher sweep to @school/goal-action-matcher.',
      },
      decisions: [],
    }
  },
}

export function createMatcherSweepJob(adapter: StubJobAdapter = defaultAdapter) {
  return createStubJob('matcher_sweep', adapter)
}
