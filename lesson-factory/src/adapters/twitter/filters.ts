import type { FreshnessSignal } from '../../core/types.js'

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'as',
  'at',
  'by',
  'from',
  'this',
  'that',
  'it',
  'about',
  'を',
  'に',
  'は',
  'が',
  'と',
  'の',
  'で',
  'も',
  'や',
  'する',
  'した',
  'れる',
  'いる',
  'ある',
])

const MIN_KEYWORD_LENGTH = 2
const MAX_KEYWORDS = 5

export function buildTwitterQuery(signal: FreshnessSignal): string {
  const keywords = extractKeywords(signal.reason)
  if (keywords.length === 0) {
    throw new Error(
      `Cannot build Twitter query: no usable keywords in freshness signal reason "${signal.reason}".`,
    )
  }

  const keywordExpr =
    keywords.length === 1 ? keywords[0]! : `(${keywords.map(quoteIfNeeded).join(' OR ')})`

  return `${keywordExpr} -is:retweet (lang:ja OR lang:en)`
}

function extractKeywords(reason: string): string[] {
  const tokens = reason
    .replace(/[「」『』【】、。,.!?！？:;()（）\[\]"']/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= MIN_KEYWORD_LENGTH)
    .filter((token) => !STOPWORDS.has(token.toLowerCase()))

  const seen = new Set<string>()
  const unique: string[] = []
  for (const token of tokens) {
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(token)
    if (unique.length >= MAX_KEYWORDS) break
  }
  return unique
}

function quoteIfNeeded(keyword: string): string {
  return /\s/.test(keyword) ? `"${keyword}"` : keyword
}
