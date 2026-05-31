import { assertFreshContextBundle } from '../../src/cli/commands/draft.js'

function validBundle(): unknown {
  return {
    run_id: 'run-abc',
    fetched_at: '2026-04-11T00:00:00.000Z',
    signals: [{ source: 'twitter', reason: 'recent activity on cursor' }],
    contexts: [
      {
        id: 'twitter:1234567890',
        source: 'twitter',
        url: 'https://twitter.com/example/status/1234567890',
        author: 'example',
        text: 'Cursor tips you might have missed.',
        fetched_at: '2026-04-11T00:00:00.000Z',
        engagement: { likes: 50, retweets: 3, replies: 1, impressions: 2000 },
        language: 'en',
        matched_signal: { source: 'twitter', reason: 'recent activity on cursor' },
      },
    ],
  }
}

describe('assertFreshContextBundle', () => {
  const filePath = '/tmp/fake-bundle.json'

  it('accepts a valid FreshContextBundle', () => {
    expect(() => assertFreshContextBundle(validBundle(), filePath)).not.toThrow()
  })

  it('rejects a bundle missing run_id with a descriptive error', () => {
    const bundle = validBundle() as Record<string, unknown>
    delete bundle.run_id
    expect(() => assertFreshContextBundle(bundle, filePath)).toThrow(/\.run_id/)
    expect(() => assertFreshContextBundle(bundle, filePath)).toThrow(
      /non-empty string/,
    )
    expect(() => assertFreshContextBundle(bundle, filePath)).toThrow(filePath)
  })

  it('rejects a bundle where contexts[0].text is missing', () => {
    const bundle = validBundle() as { contexts: Array<Record<string, unknown>> }
    const first = bundle.contexts[0]!
    delete first.text
    expect(() => assertFreshContextBundle(bundle, filePath)).toThrow(
      /\.contexts\[0\]\.text/,
    )
    expect(() => assertFreshContextBundle(bundle, filePath)).toThrow(/string/)
  })

  it('rejects non-object input', () => {
    expect(() => assertFreshContextBundle(null, filePath)).toThrow(/JSON object/)
    expect(() => assertFreshContextBundle('not a bundle', filePath)).toThrow(
      /JSON object/,
    )
  })

  it('rejects bundle with non-array signals', () => {
    const bundle = validBundle() as Record<string, unknown>
    bundle.signals = 'nope'
    expect(() => assertFreshContextBundle(bundle, filePath)).toThrow(/\.signals/)
  })

  it('rejects malformed matched_signal on a context entry', () => {
    const bundle = validBundle() as { contexts: Array<Record<string, unknown>> }
    const first = bundle.contexts[0]!
    first.matched_signal = { source: 'twitter' } // missing .reason
    expect(() => assertFreshContextBundle(bundle, filePath)).toThrow(
      /\.contexts\[0\]\.matched_signal/,
    )
  })
})
