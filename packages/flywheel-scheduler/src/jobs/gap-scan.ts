import { createStubJob, type StubJobAdapter } from './shared'

const defaultAdapter: StubJobAdapter = {
  async collect() {
    return {
      summary: {
        gap_candidates: 0,
        note: 'TODO(G2A-012): wire gap scan to @school/goal-action-gaps.',
      },
      decisions: [],
    }
  },
}

export function createGapScanJob(adapter: StubJobAdapter = defaultAdapter) {
  return createStubJob('gap_scan', adapter)
}
