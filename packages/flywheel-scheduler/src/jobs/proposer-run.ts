import { createStubJob, type StubJobAdapter } from './shared'

const defaultAdapter: StubJobAdapter = {
  async collect() {
    return {
      summary: {
        proposal_candidates: 0,
        note: 'TODO(G2A-012): wire proposer run to @school/goal-action-proposer.',
      },
      decisions: [],
    }
  },
}

export function createProposerRunJob(adapter: StubJobAdapter = defaultAdapter) {
  return createStubJob('proposer_run', adapter)
}
