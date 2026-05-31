/**
 * PLAN-001: Goal Normalizer
 *
 * Cleans raw goal text and extracts structured fields using
 * simple heuristics (no AI calls). This is the first stage
 * of the goal-first planning pipeline.
 */

import type { NormalizedGoal } from './types'
import { GOAL_NORMALIZATION_PROMPT } from './ai-prompts'
import { getExternalPlannerConfig } from '../zai'
import { isMvpEnabledDomainSlug, MVP_COMING_SOON_MESSAGE } from './mvp-config'

// ── Tool name patterns ──

const TOOL_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /claude\s*code/i, name: 'Claude Code' },
  { pattern: /claude/i, name: 'Claude' },
  { pattern: /chatgpt/i, name: 'ChatGPT' },
  { pattern: /gpt-?4/i, name: 'GPT-4' },
  { pattern: /copilot/i, name: 'GitHub Copilot' },
  { pattern: /cursor/i, name: 'Cursor' },
  { pattern: /v0/i, name: 'v0' },
  { pattern: /codex/i, name: 'Codex' },
  { pattern: /midjourney/i, name: 'Midjourney' },
  { pattern: /stable\s*diffusion/i, name: 'Stable Diffusion' },
  { pattern: /dall-?e/i, name: 'DALL-E' },
  { pattern: /canva/i, name: 'Canva' },
  { pattern: /figma/i, name: 'Figma' },
  { pattern: /notion/i, name: 'Notion' },
  { pattern: /zapier/i, name: 'Zapier' },
  { pattern: /make\.com|integromat/i, name: 'Make' },
  { pattern: /next\.?js|nextjs/i, name: 'Next.js' },
  { pattern: /react/i, name: 'React' },
  { pattern: /supabase/i, name: 'Supabase' },
  { pattern: /vercel/i, name: 'Vercel' },
  { pattern: /firebase/i, name: 'Firebase' },
  { pattern: /wordpress/i, name: 'WordPress' },
]

// ── Deadline patterns ──

const DEADLINE_PATTERNS: RegExp[] = [
  // Japanese
  /(\d+)\s*(?:ヶ月|か月|カ月)(?:以内|まで)?/,
  /(\d+)\s*(?:週間|しゅうかん)(?:以内|まで)?/,
  /(\d+)\s*(?:日|にち)(?:以内|まで)?/,
  /(?:今月|来月|再来月)(?:まで|中)?/,
  /(\d{4})\s*年\s*(\d{1,2})\s*月/,
  // English
  /(?:within|in)\s+(\d+)\s+(?:months?|weeks?|days?)/i,
  /by\s+(?:next\s+)?(?:month|week|year)/i,
  /(?:before|until)\s+\w+/i,
]

// ── Domain signal words (lightweight pre-classification) ──

const DOMAIN_HINT_KEYWORDS: Record<string, string[]> = {
  web: [
    'website', 'web', 'サイト', 'ホームページ', 'ランディングページ', 'LP',
    'ポートフォリオ', 'portfolio', 'homepage', 'landing page',
  ],
  automation: [
    '自動化', 'automation', 'automate', '業務効率', 'RPA', 'ワークフロー',
    'スクリプト', 'バッチ', '定型作業', 'prompt', 'プロンプト',
  ],
  content: [
    'コンテンツ', 'content', 'ブログ', 'blog', '記事', 'article',
    'ライティング', 'writing', '動画', 'video', '画像生成', 'SNS',
    'マーケティング', 'marketing', 'プレゼン', 'スライド',
  ],
  app: [
    'アプリ', 'app', 'application', 'SaaS', 'ダッシュボード', 'dashboard',
    'プラットフォーム', 'platform', 'CRUD', 'プロトタイプ', 'prototype',
    'サービス開発', 'モバイル', 'mobile',
  ],
}

/**
 * Detect whether the input text is primarily Japanese or English.
 * Uses a simple heuristic: if CJK characters exceed 10% of the text, treat as Japanese.
 */
function detectLanguage(text: string): 'ja' | 'en' {
  const cjkPattern = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/g
  const cjkMatches = text.match(cjkPattern)
  const cjkRatio = (cjkMatches?.length ?? 0) / Math.max(text.length, 1)
  return cjkRatio > 0.1 ? 'ja' : 'en'
}

/**
 * Extract tool names mentioned in the goal text.
 */
function extractToolMentions(text: string): string[] {
  const found: string[] = []
  for (const { pattern, name } of TOOL_PATTERNS) {
    if (pattern.test(text)) {
      found.push(name)
    }
  }
  // Deduplicate (e.g. "Claude" is substring of "Claude Code")
  return [...new Set(found)]
}

/**
 * Extract deadline mentions from goal text.
 */
function extractDeadline(text: string): string | undefined {
  for (const pattern of DEADLINE_PATTERNS) {
    const match = text.match(pattern)
    if (match) return match[0]
  }
  return undefined
}

/**
 * Extract implied domain slugs from goal text using keyword matching.
 */
function extractImpliedDomains(text: string): string[] {
  const lowerText = text.toLowerCase()
  const matched: string[] = []

  for (const [domain, keywords] of Object.entries(DOMAIN_HINT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        matched.push(domain)
        break
      }
    }
  }

  return matched
}

/**
 * Generate a concise outcome summary from the cleaned goal text.
 * Strips meta-phrases ("I want to", "〜したい") to get the core intent.
 */
function summarizeOutcome(text: string, language: 'ja' | 'en'): string {
  let summary = text

  if (language === 'ja') {
    // Remove polite prefixes/suffixes
    summary = summary
      .replace(/^(私は|僕は|自分は)/g, '')
      .replace(/(したい|したいです|を作りたい|を作りたいです|を学びたい|を学びたいです|がしたい|がしたいです|をしたい|をしたいです)$/g, '')
      .replace(/^(.*?)(?:を|が|に)(?:学ぶ|作る|始める|できるようになる)/g, '$1')
      .trim()
  } else {
    // Remove English meta-phrases
    summary = summary
      .replace(/^(I want to|I'd like to|I need to|I wish to|Help me)\s+/i, '')
      .replace(/^(learn|build|create|make|start)\s+(how to\s+)?/i, '')
      .trim()
  }

  // Truncate if very long
  if (summary.length > 120) {
    summary = summary.slice(0, 117) + '...'
  }

  return summary || text.slice(0, 120)
}

function applyMvpSupportGate(goal: NormalizedGoal): NormalizedGoal {
  const hasUnsupportedDomain =
    goal.implied_domains.length > 0 &&
    goal.implied_domains.some((domain) => !isMvpEnabledDomainSlug(domain))

  if (!hasUnsupportedDomain) {
    return {
      ...goal,
      supportStatus: 'supported',
      supportMessage: null,
    }
  }

  return {
    ...goal,
    supportStatus: 'coming-soon',
    supportMessage: MVP_COMING_SOON_MESSAGE,
  }
}

/**
 * Normalize a raw goal string into a structured NormalizedGoal.
 *
 * Performs:
 * - Whitespace cleanup
 * - Language detection
 * - Tool mention extraction
 * - Deadline detection
 * - Domain hint extraction
 * - Outcome summarization
 *
 * @param rawGoal - The user's free-text learning goal
 * @returns Structured NormalizedGoal with extracted fields
 */
export function normalizeGoal(rawGoal: string): NormalizedGoal {
  const cleaned = rawGoal
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')

  const language = detectLanguage(cleaned)
  const tool_mentions = extractToolMentions(cleaned)
  const deadline_mention = extractDeadline(cleaned)
  const implied_domains = extractImpliedDomains(cleaned)
  const outcome_summary = summarizeOutcome(cleaned, language)

  return applyMvpSupportGate({
    raw: rawGoal,
    cleaned,
    language,
    implied_domains,
    tool_mentions,
    deadline_mention,
    outcome_summary,
  })
}

// ── AI-driven variant ──

const ALLOWED_DOMAINS = new Set(['web', 'automation', 'content', 'app'])
const ALLOWED_LEVELS = new Set(['beginner', 'intermediate', 'advanced'])
const ALLOWED_STYLES = new Set(['hands-on', 'conceptual', 'mixed'])

function coerceStringArray(input: unknown, max = 12): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max)
}

function parseAiNormalizedGoal(rawGoal: string, cleaned: string, json: unknown): NormalizedGoal {
  if (!json || typeof json !== 'object') {
    throw new Error('AI response is not an object')
  }

  const obj = json as Record<string, unknown>

  const language: 'ja' | 'en' = obj.language === 'en' ? 'en' : 'ja'
  const outcome_summary =
    typeof obj.outcome_summary === 'string' && obj.outcome_summary.trim()
      ? obj.outcome_summary.trim().slice(0, 200)
      : cleaned.slice(0, 120)

  const implied_domains = coerceStringArray(obj.implied_domains).filter((d) => ALLOWED_DOMAINS.has(d))
  const tool_mentions = coerceStringArray(obj.tool_mentions)
  const deadline_mention =
    typeof obj.deadline_mention === 'string' && obj.deadline_mention.trim()
      ? obj.deadline_mention.trim()
      : undefined
  const constraints = coerceStringArray(obj.constraints)
  const success_criteria = coerceStringArray(obj.success_criteria)

  const inferredStyle =
    typeof obj.inferred_learning_style === 'string' && ALLOWED_STYLES.has(obj.inferred_learning_style)
      ? (obj.inferred_learning_style as NormalizedGoal['inferred_learning_style'])
      : null

  let skill_signals: NormalizedGoal['skill_signals'] = null
  if (obj.skill_signals && typeof obj.skill_signals === 'object') {
    const s = obj.skill_signals as Record<string, unknown>
    const level = typeof s.current_level === 'string' && ALLOWED_LEVELS.has(s.current_level)
      ? (s.current_level as 'beginner' | 'intermediate' | 'advanced')
      : 'beginner'
    skill_signals = {
      current_level: level,
      strengths: coerceStringArray(s.strengths),
      gaps: coerceStringArray(s.gaps),
    }
  }

  return applyMvpSupportGate({
    raw: rawGoal,
    cleaned,
    language,
    implied_domains,
    tool_mentions,
    deadline_mention,
    outcome_summary,
    constraints,
    success_criteria,
    inferred_learning_style: inferredStyle,
    skill_signals,
  })
}

/**
 * AI-powered variant of {@link normalizeGoal}.
 *
 * Calls ZAI with a structured JSON prompt to extract richer fields
 * (constraints, success criteria, skill signals, learning style) that
 * cannot be reliably inferred via regex. Falls back to the deterministic
 * {@link normalizeGoal} on any failure (no API key, network error,
 * malformed JSON, validation error).
 *
 * @param rawGoal - The user's free-text learning goal
 * @param options - Optional model override and AbortSignal
 * @returns Structured {@link NormalizedGoal}. Never throws.
 */
export async function normalizeGoalWithAI(
  rawGoal: string,
  options?: { model?: string; signal?: AbortSignal }
): Promise<NormalizedGoal> {
  const fallback = normalizeGoal(rawGoal)
  const config = getExternalPlannerConfig()

  if (!config.available) {
    return fallback
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  const externalSignal = options?.signal
  const abortHandler = () => controller.abort()
  externalSignal?.addEventListener('abort', abortHandler)

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? config.model,
        stream: false,
        temperature: 0.2,
        top_p: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: GOAL_NORMALIZATION_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({ rawGoal, cleanedGoal: fallback.cleaned }, null, 2),
          },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`ZAI normalize-goal failed: ${response.status}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      output_text?: string
    }

    const content =
      (typeof payload.output_text === 'string' ? payload.output_text : '') ||
      payload.choices?.[0]?.message?.content ||
      ''

    if (!content) {
      throw new Error('ZAI normalize-goal: empty content')
    }

    const parsed = JSON.parse(content)
    const aiGoal = parseAiNormalizedGoal(rawGoal, fallback.cleaned, parsed)

    // Blend: prefer AI output but keep deterministic tool_mentions as union
    const toolUnion = [...new Set([...aiGoal.tool_mentions, ...fallback.tool_mentions])]
    const domainUnion = [...new Set([...aiGoal.implied_domains, ...fallback.implied_domains])]

    return applyMvpSupportGate({
      ...aiGoal,
      tool_mentions: toolUnion,
      implied_domains: domainUnion,
      deadline_mention: aiGoal.deadline_mention ?? fallback.deadline_mention,
    })
  } catch (error) {
    console.warn('[goal-first] normalizeGoalWithAI failed, using deterministic fallback', error)
    return fallback
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortHandler)
  }
}
