import { describe, expect, it, vi } from 'vitest'

import { TwitterAdapter } from '../../src/adapters/twitter/index.js'
import type { TwitterApiClient } from '../../src/adapters/twitter/client.js'
import type { FreshnessSignal } from '../../src/core/types.js'

function buildMockClient(): TwitterApiClient {
  const search = vi.fn().mockResolvedValue({
    tweets: [
      {
        id: '1001',
        text: 'Supabase RLS の policy を 1 行で書く方法',
        author_id: 'u1',
        lang: 'ja',
        public_metrics: { like_count: 42, retweet_count: 5, reply_count: 1, impression_count: 1200 },
      },
      {
        id: '1002',
        text: 'Postgres row level security explained simply',
        author_id: 'u2',
        lang: 'en',
        public_metrics: { like_count: 8, retweet_count: 0, reply_count: 0, impression_count: 200 },
      },
      {
        id: '1003',
        text: 'auth.uid() returning null gotcha',
        author_id: 'u1',
        lang: 'en',
        public_metrics: { like_count: 130, retweet_count: 22, reply_count: 4, impression_count: 9000 },
      },
      {
        id: '1004',
        text: 'RLS policy templates worth bookmarking',
        author_id: 'u3',
        lang: 'en',
        public_metrics: { like_count: 3, retweet_count: 1, reply_count: 0, impression_count: 80 },
      },
      {
        id: '1005',
        text: 'Supabase の policy デバッグ tips',
        author_id: 'u2',
        lang: 'ja',
        public_metrics: { like_count: 17, retweet_count: 2, reply_count: 0, impression_count: 410 },
      },
    ],
    includes: {
      users: [
        { id: 'u1', username: 'alice', name: 'Alice' },
        { id: 'u2', username: 'bob', name: 'Bob' },
        { id: 'u3', username: 'carol', name: 'Carol' },
      ],
    },
  })
  return { search }
}

describe('TwitterAdapter.fetchContext', () => {
  it('maps tweets to FreshContext shape and dedupes by id', async () => {
    const client = buildMockClient()
    const adapter = new TwitterAdapter({ client })

    const signal: FreshnessSignal = {
      source: 'supabase/rls',
      reason: 'Supabase RLS policy 最新パターン',
    }
    const contexts = await adapter.fetchContext([signal], 'run.test.twitter')

    expect((client.search as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    expect(contexts).toHaveLength(5)

    const first = contexts[0]
    expect(first).toMatchObject({
      id: 'twitter:1001',
      source: 'twitter',
      author: 'alice',
      language: 'ja',
      matched_signal: signal,
    })
    expect(first?.url).toBe('https://twitter.com/alice/status/1001')
    expect(first?.engagement.likes).toBe(42)
    expect(first?.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const ids = contexts.map((context) => context.id)
    expect(new Set(ids).size).toBe(5)
  })

  it('removes duplicate tweet ids when the same id appears across signal queries', async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({
        tweets: [
          {
            id: '2001',
            text: 'shared tweet',
            author_id: 'u1',
            lang: 'en',
            public_metrics: { like_count: 1, retweet_count: 0, reply_count: 0, impression_count: 0 },
          },
        ],
        includes: { users: [{ id: 'u1', username: 'alice' }] },
      })
      .mockResolvedValueOnce({
        tweets: [
          {
            id: '2001',
            text: 'shared tweet',
            author_id: 'u1',
            lang: 'en',
            public_metrics: { like_count: 1, retweet_count: 0, reply_count: 0, impression_count: 0 },
          },
        ],
        includes: { users: [{ id: 'u1', username: 'alice' }] },
      })

    const adapter = new TwitterAdapter({ client: { search } })
    const contexts = await adapter.fetchContext(
      [
        { source: 'sigA', reason: 'topic alpha keyword' },
        { source: 'sigB', reason: 'topic beta keyword' },
      ],
      'run.test.dedup',
    )

    expect(search).toHaveBeenCalledTimes(2)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.id).toBe('twitter:2001')
  })
})
