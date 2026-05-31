import type { FreshContext, FreshnessSignal } from '../../core/types.js'
import { createTwitterApiClient, type TwitterApiClient, type TwitterSearchOptions } from './client.js'
import { buildTwitterQuery } from './filters.js'

export interface TwitterAdapterOptions {
  bearerToken?: string
  client?: TwitterApiClient
  search?: TwitterSearchOptions
}

export class TwitterAdapter {
  private readonly client: TwitterApiClient
  private readonly search: TwitterSearchOptions

  constructor(options: TwitterAdapterOptions = {}) {
    if (options.client) {
      this.client = options.client
    } else {
      const token = options.bearerToken ?? process.env.TWITTER_BEARER_TOKEN ?? ''
      this.client = createTwitterApiClient(token)
    }
    this.search = options.search ?? {}
  }

  async fetchContext(signals: FreshnessSignal[], _runId: string): Promise<FreshContext[]> {
    const collected: FreshContext[] = []
    const fetched_at = new Date().toISOString()

    for (const signal of signals) {
      const query = buildTwitterQuery(signal)
      const result = await this.client.search(query, this.search)

      const usersById = new Map<string, { username: string; name?: string }>()
      for (const user of result.includes.users) {
        usersById.set(user.id, { username: user.username, name: user.name })
      }

      for (const tweet of result.tweets) {
        const author = tweet.author_id ? usersById.get(tweet.author_id) : undefined
        const authorHandle = author?.username ?? tweet.author_id ?? 'unknown'
        const tweetUrl = `https://twitter.com/${authorHandle}/status/${tweet.id}`

        collected.push({
          id: `twitter:${tweet.id}`,
          source: 'twitter',
          url: tweetUrl,
          author: authorHandle,
          text: tweet.text,
          fetched_at,
          engagement: {
            likes: tweet.public_metrics?.like_count,
            retweets: tweet.public_metrics?.retweet_count,
            replies: tweet.public_metrics?.reply_count,
            impressions: tweet.public_metrics?.impression_count,
          },
          language: tweet.lang ?? 'unknown',
          matched_signal: signal,
        })
      }
    }

    return dedupeById(collected)
  }
}

function dedupeById(contexts: FreshContext[]): FreshContext[] {
  const seen = new Set<string>()
  const result: FreshContext[] = []
  for (const context of contexts) {
    if (seen.has(context.id)) continue
    seen.add(context.id)
    result.push(context)
  }
  return result
}
