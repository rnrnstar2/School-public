import { TwitterApi, type TweetV2, type TweetSearchRecentV2Paginator } from 'twitter-api-v2'

export interface TwitterSearchOptions {
  max_results?: number
  days_back?: number
}

export interface TwitterSearchResult {
  tweets: TweetV2[]
  includes: {
    users: Array<{ id: string; username: string; name?: string }>
  }
}

export interface TwitterApiClient {
  search(query: string, options?: TwitterSearchOptions): Promise<TwitterSearchResult>
}

const DEFAULT_MAX_RESULTS = 25
const DEFAULT_DAYS_BACK = 7
const MIN_MAX_RESULTS = 10
const MAX_MAX_RESULTS = 100

export function createTwitterApiClient(bearerToken: string): TwitterApiClient {
  if (!bearerToken) {
    throw new Error(
      'Missing Twitter bearer token. export TWITTER_BEARER_TOKEN=your_bearer_token before running lesson:research --adapter twitter.',
    )
  }

  const client = new TwitterApi(bearerToken).readOnly

  return {
    async search(query, options = {}): Promise<TwitterSearchResult> {
      const requested = options.max_results ?? DEFAULT_MAX_RESULTS
      const max_results = Math.max(MIN_MAX_RESULTS, Math.min(MAX_MAX_RESULTS, requested))
      const days_back = options.days_back ?? DEFAULT_DAYS_BACK
      const start_time = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000).toISOString()

      let paginator: TweetSearchRecentV2Paginator
      try {
        paginator = await client.v2.search(query, {
          max_results,
          start_time,
          'tweet.fields': ['public_metrics', 'lang', 'created_at', 'author_id'],
          'user.fields': ['username', 'name'],
          expansions: ['author_id'],
        })
      } catch (error) {
        throw wrapTwitterError(error)
      }

      const tweets = paginator.data.data ?? []
      const users = paginator.data.includes?.users ?? []

      return {
        tweets,
        includes: {
          users: users.map((user) => ({
            id: user.id,
            username: user.username,
            name: user.name,
          })),
        },
      }
    },
  }
}

function wrapTwitterError(error: unknown): Error {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const code = record.code as number | undefined
    const message = (record.message as string | undefined) ?? 'Twitter API request failed'

    if (code === 429) {
      return new Error(
        `Twitter API rate limit hit (HTTP 429). Wait until the reset window before retrying. Original message: ${message}`,
      )
    }
    if (code === 401 || code === 403) {
      return new Error(
        `Twitter API rejected the bearer token (HTTP ${code}). Verify TWITTER_BEARER_TOKEN has Elevated/Recent Search access. Original message: ${message}`,
      )
    }
    return new Error(`Twitter API error (HTTP ${code ?? 'unknown'}): ${message}`)
  }
  return new Error(`Twitter API error: ${String(error)}`)
}
