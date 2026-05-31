/**
 * PLAN-002: Domain Classifier
 *
 * Maps goal text to one or more domain slugs (web, automation, content, app)
 * using keyword/phrase matching instead of regex-based track detection.
 *
 * The DOMAIN_SIGNALS config object is the single source of truth for
 * domain mapping and is designed to be easily extensible.
 */

import type { NormalizedGoal, DomainClassification, DomainScore } from './types'
import { DOMAIN_CLASSIFICATION_PROMPT } from './ai-prompts'
import { getExternalPlannerConfig } from '../zai'

// ── Domain signal configuration ──

/**
 * Maps keywords and phrases to domain slugs with individual signal weights.
 * To add a new domain or signal, simply extend this object.
 *
 * Weights:
 * - 1.0: Strong, unambiguous signal (e.g. "website" -> web)
 * - 0.7: Good signal but could be multi-domain (e.g. "deploy" -> web)
 * - 0.4: Weak signal, contributes to mixed classification
 */
export const DOMAIN_SIGNALS: Record<string, { keywords: { term: string; weight: number }[] }> = {
  web: {
    keywords: [
      // Strong signals
      { term: 'website', weight: 1.0 },
      { term: 'web site', weight: 1.0 },
      { term: 'webサイト', weight: 1.0 },
      { term: 'ウェブサイト', weight: 1.0 },
      { term: 'ホームページ', weight: 1.0 },
      { term: 'ランディングページ', weight: 1.0 },
      { term: 'landing page', weight: 1.0 },
      { term: 'lp', weight: 0.9 },
      { term: 'ポートフォリオサイト', weight: 1.0 },
      { term: 'portfolio site', weight: 1.0 },
      { term: 'サイト制作', weight: 1.0 },
      { term: 'web制作', weight: 1.0 },
      // Medium signals
      { term: 'html', weight: 0.7 },
      { term: 'css', weight: 0.7 },
      { term: 'next.js', weight: 0.7 },
      { term: 'nextjs', weight: 0.7 },
      { term: 'tailwind', weight: 0.7 },
      { term: 'vercel', weight: 0.6 },
      { term: 'ポートフォリオ', weight: 0.8 },
      { term: 'portfolio', weight: 0.8 },
      { term: 'seo', weight: 0.6 },
      { term: 'デプロイ', weight: 0.5 },
      { term: 'deploy', weight: 0.5 },
      // Weak signals
      { term: 'site', weight: 0.4 },
      { term: 'サイト', weight: 0.4 },
      { term: 'page', weight: 0.3 },
      { term: 'ページ', weight: 0.3 },
    ],
  },

  automation: {
    keywords: [
      // Strong signals
      { term: '自動化', weight: 1.0 },
      { term: 'automation', weight: 1.0 },
      { term: 'automate', weight: 1.0 },
      { term: '業務効率化', weight: 1.0 },
      { term: 'ワークフロー自動化', weight: 1.0 },
      { term: 'rpa', weight: 1.0 },
      { term: 'バッチ処理', weight: 0.9 },
      { term: '定型作業', weight: 0.9 },
      { term: 'プロンプトエンジニアリング', weight: 0.9 },
      { term: 'prompt engineering', weight: 0.9 },
      // Medium signals
      { term: '業務フロー', weight: 0.8 },
      { term: 'ai api', weight: 0.7 },
      { term: 'スクリプト', weight: 0.7 },
      { term: 'script', weight: 0.6 },
      { term: 'zapier', weight: 0.8 },
      { term: 'make', weight: 0.6 },
      { term: '業務', weight: 0.5 },
      { term: 'ai活用', weight: 0.6 },
      { term: 'aiチャット', weight: 0.6 },
      // Weak signals
      { term: '効率', weight: 0.3 },
      { term: 'プロンプト', weight: 0.4 },
      { term: 'prompt', weight: 0.4 },
    ],
  },

  content: {
    keywords: [
      // Strong signals
      { term: 'コンテンツ制作', weight: 1.0 },
      { term: 'コンテンツ作成', weight: 1.0 },
      { term: 'content creation', weight: 1.0 },
      { term: 'content creator', weight: 1.0 },
      { term: 'ブログ記事', weight: 1.0 },
      { term: 'blog post', weight: 1.0 },
      { term: 'aiライティング', weight: 1.0 },
      { term: 'ai writing', weight: 1.0 },
      { term: 'ai画像生成', weight: 1.0 },
      { term: 'コンテンツマーケティング', weight: 1.0 },
      { term: 'content marketing', weight: 1.0 },
      // Medium signals
      { term: 'ブログ', weight: 0.8 },
      { term: 'blog', weight: 0.8 },
      { term: '記事', weight: 0.7 },
      { term: 'article', weight: 0.7 },
      { term: 'sns投稿', weight: 0.8 },
      { term: 'sns発信', weight: 0.8 },
      { term: 'プレゼン資料', weight: 0.8 },
      { term: 'スライド', weight: 0.7 },
      { term: '教材', weight: 0.7 },
      { term: 'ライティング', weight: 0.7 },
      { term: 'writing', weight: 0.6 },
      { term: '動画', weight: 0.6 },
      { term: 'video', weight: 0.5 },
      // Weak signals
      { term: '文章', weight: 0.4 },
      { term: '画像', weight: 0.3 },
      { term: 'マーケティング', weight: 0.4 },
    ],
  },

  app: {
    keywords: [
      // Strong signals
      { term: 'アプリ開発', weight: 1.0 },
      { term: 'アプリ制作', weight: 1.0 },
      { term: 'アプリを作', weight: 1.0 },
      { term: 'app development', weight: 1.0 },
      { term: 'build an app', weight: 1.0 },
      { term: 'webアプリ', weight: 1.0 },
      { term: 'web app', weight: 1.0 },
      { term: 'webapp', weight: 1.0 },
      { term: 'saas', weight: 1.0 },
      { term: 'アプリケーション', weight: 0.9 },
      { term: 'application', weight: 0.8 },
      { term: 'プロトタイプ', weight: 0.8 },
      { term: 'prototype', weight: 0.8 },
      // Medium signals
      { term: 'ダッシュボード', weight: 0.7 },
      { term: 'dashboard', weight: 0.7 },
      { term: 'crud', weight: 0.8 },
      { term: 'モバイルアプリ', weight: 0.9 },
      { term: 'mobile app', weight: 0.9 },
      { term: 'プラットフォーム', weight: 0.6 },
      { term: 'platform', weight: 0.6 },
      { term: 'サービス開発', weight: 0.8 },
      { term: 'supabase', weight: 0.5 },
      { term: 'firebase', weight: 0.5 },
      { term: 'データベース', weight: 0.5 },
      { term: 'database', weight: 0.5 },
      // Weak signals
      { term: 'アプリ', weight: 0.5 },
      { term: 'app', weight: 0.3 },
    ],
  },
}

/** Threshold above which a domain is considered a match */
const MATCH_THRESHOLD = 0.3

/** Threshold for mixed classification — if secondary domain is above this ratio of primary */
const MIXED_THRESHOLD = 0.3

/**
 * Classify a normalized goal into one or more learning domains.
 *
 * Uses weighted keyword matching from DOMAIN_SIGNALS to produce
 * confidence scores per domain. Replaces the old regex-based
 * track detection with a more flexible, extensible approach.
 *
 * @param goal - A NormalizedGoal from the normalizer stage
 * @returns DomainClassification with scored domains and primary pick
 */
export function classifyGoalDomains(goal: NormalizedGoal): DomainClassification {
  const lowerText = goal.cleaned.toLowerCase()
  const scores: Record<string, number> = {}

  // Score each domain by summing matched keyword weights
  for (const [domainSlug, config] of Object.entries(DOMAIN_SIGNALS)) {
    let totalWeight = 0
    let matchCount = 0

    for (const { term, weight } of config.keywords) {
      if (lowerText.includes(term.toLowerCase())) {
        totalWeight += weight
        matchCount++
      }
    }

    // Normalize: cap at 1.0, boost slightly if multiple signals converge
    if (matchCount > 0) {
      const baseScore = Math.min(totalWeight / 2.0, 1.0)
      const convergenceBonus = Math.min(matchCount * 0.05, 0.15)
      scores[domainSlug] = Math.min(baseScore + convergenceBonus, 1.0)
    }
  }

  // Also consider implied_domains from the normalizer as a boost
  for (const domain of goal.implied_domains) {
    if (!Object.prototype.hasOwnProperty.call(DOMAIN_SIGNALS, domain)) {
      continue
    }

    if (scores[domain] !== undefined) {
      scores[domain] = Math.min(scores[domain] + 0.1, 1.0)
    } else {
      scores[domain] = 0.35
    }
  }

  // Build sorted domain list. Tie-break by slug lexical order so ties between
  // e.g. 'web' and 'app' at identical confidence always resolve the same way.
  const domainList: DomainScore[] = Object.entries(scores)
    .filter(([, score]) => score >= MATCH_THRESHOLD)
    .map(([slug, confidence]) => ({ slug, confidence: Math.round(confidence * 100) / 100 }))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence
      }
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
    })

  // If nothing matched, default to 'mixed' with all domains at low confidence
  if (domainList.length === 0) {
    return {
      domains: [
        { slug: 'web', confidence: 0.2 },
        { slug: 'automation', confidence: 0.2 },
        { slug: 'content', confidence: 0.2 },
        { slug: 'app', confidence: 0.2 },
      ],
      primary: 'mixed',
      isMixed: true,
    }
  }

  const primary = domainList[0].slug
  const isMixed = domainList.length > 1 &&
    domainList[1].confidence >= domainList[0].confidence * MIXED_THRESHOLD

  return {
    domains: domainList,
    primary,
    isMixed,
  }
}

// ── AI-driven variant ──

const KNOWN_DOMAINS = ['web', 'automation', 'content', 'app'] as const

interface AiDomainResponse {
  primary_domain?: string
  domain_scores?: Record<string, number>
  is_mixed?: boolean
  reasoning?: string
}

function blendClassification(
  aiResp: AiDomainResponse,
  deterministic: DomainClassification
): DomainClassification {
  const deterministicMap: Record<string, number> = {}
  for (const d of deterministic.domains) {
    deterministicMap[d.slug] = d.confidence
  }

  const aiScores = aiResp.domain_scores ?? {}
  const blended: DomainScore[] = []

  for (const slug of KNOWN_DOMAINS) {
    const aiScore = typeof aiScores[slug] === 'number' ? Math.max(0, Math.min(1, aiScores[slug])) : 0
    const detScore = deterministicMap[slug] ?? 0
    // Weighted blend: 70% AI, 30% deterministic prior
    const confidence = Math.round((aiScore * 0.7 + detScore * 0.3) * 100) / 100
    if (confidence >= MATCH_THRESHOLD) {
      blended.push({ slug, confidence })
    }
  }

  // Deterministic: confidence desc, then slug lexical asc for stable tie-breaking.
  blended.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence
    }
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
  })

  if (blended.length === 0) {
    return deterministic
  }

  const aiPrimary = typeof aiResp.primary_domain === 'string' ? aiResp.primary_domain : ''
  const primary =
    aiPrimary && blended.some((d) => d.slug === aiPrimary) ? aiPrimary : blended[0].slug

  const isMixed =
    typeof aiResp.is_mixed === 'boolean'
      ? aiResp.is_mixed
      : blended.length > 1 && blended[1].confidence >= blended[0].confidence * MIXED_THRESHOLD

  return {
    domains: blended,
    primary,
    isMixed,
  }
}

/**
 * AI-powered variant of {@link classifyGoalDomains}.
 *
 * Uses ZAI to multi-label the normalized goal against the four
 * supported domains and blends the AI confidence with the deterministic
 * keyword-based priors (70% AI / 30% deterministic). On any failure
 * (no API key, network error, malformed JSON) it falls back to the
 * deterministic classifier output.
 *
 * @param goal - A {@link NormalizedGoal} from the normalizer stage
 * @param options - Optional model override and AbortSignal
 * @returns {@link DomainClassification}. Never throws.
 */
export async function classifyGoalDomainsWithAI(
  goal: NormalizedGoal,
  options?: { model?: string; signal?: AbortSignal }
): Promise<DomainClassification> {
  const deterministic = classifyGoalDomains(goal)
  const config = getExternalPlannerConfig()

  if (!config.available) {
    return deterministic
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
        temperature: 0.1,
        top_p: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DOMAIN_CLASSIFICATION_PROMPT },
          {
            role: 'user',
            content: JSON.stringify(
              {
                cleaned: goal.cleaned,
                outcome_summary: goal.outcome_summary,
                implied_domains: goal.implied_domains,
                tool_mentions: goal.tool_mentions,
                constraints: goal.constraints ?? [],
                success_criteria: goal.success_criteria ?? [],
              },
              null,
              2
            ),
          },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`ZAI classify-domains failed: ${response.status}`)
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
      throw new Error('ZAI classify-domains: empty content')
    }

    const parsed = JSON.parse(content) as AiDomainResponse
    return blendClassification(parsed, deterministic)
  } catch (error) {
    console.warn('[goal-first] classifyGoalDomainsWithAI failed, using deterministic fallback', error)
    return deterministic
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortHandler)
  }
}
