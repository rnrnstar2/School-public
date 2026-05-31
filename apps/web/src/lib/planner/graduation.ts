import type { MilestoneProgress, PlannerArtifact } from '@/types'
import type { PlannerPlanMilestone } from '@/lib/planner/types'

// ── TQ-240 — 動的卒業ゲート (graduation gate options) ──
//
// Owner Vision (2026-05-08 確定):
//   「卒業ゲートはペルソナによって違うし、Vercel が多いと思うけどもっといい選択肢も
//    あるかもしれない。固定的な卒業ゲートは良くない」
//
// `WEB_BUILDER_GRADUATION_CRITERIA` 等の固定 7 項目は keyword match に依存しており、
// 「Vercel URL を出した」が事実上の唯一の卒業条件になっていた。本 namespace は
// それを置き換えるのではなく **追加** することで、persona × goal で options を動的
// に出し分けられるようにする (旧 fn は後方互換のため残す)。
//
// 実 YAML 側の真実: `lesson-factory/lessons/personas/<persona>.yaml` の
// `graduation_options` フィールド。本ファイルではそれと一致する 1st-class TS 型を
// export し、URL pattern check 等の判定ロジックを提供する。Phase 1 (本 TQ) では
// URL regex check のみ。Judge sub-agent 経由の合理性判定は TQ-236 で本格化する。

export type GraduationOptionKind =
  | 'vercel_url'
  | 'github_repo'
  | 'lovable_url'
  | 'campaign_lp'
  | 'figma_publish'
  | 'workflow_recording'
  | 'other_artifact'

export interface GraduationOption {
  kind: GraduationOptionKind
  label: string
  /** 任意の検証ヒント。Phase 1 では `url_pattern` のみ参照される。 */
  criteria_yaml?: string
  /** other_artifact 等で学習者の自由記述説明を必須にする。 */
  requires_explanation?: boolean
}

/**
 * persona ID → graduation options のフォールバック表。
 * 一次正本は `lesson-factory/lessons/personas/<persona>.yaml#graduation_options`
 * だが、本 TS 層から YAML を直接読まないため、ここに静的ミラーを置く。
 *
 * YAML を更新したら本テーブルも更新するルール (TQ-240 注記)。
 */
export const PERSONA_GRADUATION_OPTIONS: Record<string, GraduationOption[]> = {
  'persona.web-builder': [
    {
      kind: 'vercel_url',
      label: 'Vercel に deploy したアプリの URL',
      criteria_yaml: 'url_pattern: "^https://.*\\.vercel\\.app/.*"\nvalidates_with: response_200_check',
    },
    {
      kind: 'github_repo',
      label: 'GitHub の public リポジトリ',
      criteria_yaml: 'url_pattern: "^https://github\\.com/.+/.+"\nvalidates_with: api_check_public',
    },
    {
      kind: 'lovable_url',
      label: 'Lovable で公開した URL',
      criteria_yaml: 'url_pattern: "^https://.*\\.lovable\\.(app|dev)/.*"\nvalidates_with: response_200_check',
    },
    {
      kind: 'other_artifact',
      label: 'その他の公開アーティファクト (理由を添えて)',
      requires_explanation: true,
    },
  ],
  'persona.noneng-webapp': [
    {
      kind: 'vercel_url',
      label: 'Vercel に deploy したアプリの URL',
      criteria_yaml: 'url_pattern: "^https://.*\\.vercel\\.app/.*"\nvalidates_with: response_200_check',
    },
    {
      kind: 'github_repo',
      label: 'GitHub の public リポジトリ',
      criteria_yaml: 'url_pattern: "^https://github\\.com/.+/.+"\nvalidates_with: api_check_public',
    },
    {
      kind: 'lovable_url',
      label: 'Lovable で公開した URL',
      criteria_yaml: 'url_pattern: "^https://.*\\.lovable\\.(app|dev)/.*"\nvalidates_with: response_200_check',
    },
    {
      kind: 'other_artifact',
      label: 'その他の公開アーティファクト (理由を添えて)',
      requires_explanation: true,
    },
  ],
  'persona.ai-app-builder': [
    {
      kind: 'vercel_url',
      label: 'Vercel に deploy したアプリの URL',
      criteria_yaml: 'url_pattern: "^https://.*\\.vercel\\.app/.*"\nvalidates_with: response_200_check',
    },
    {
      kind: 'github_repo',
      label: 'GitHub の public リポジトリ',
      criteria_yaml: 'url_pattern: "^https://github\\.com/.+/.+"\nvalidates_with: api_check_public',
    },
    {
      kind: 'lovable_url',
      label: 'Lovable で公開した URL',
      criteria_yaml: 'url_pattern: "^https://.*\\.lovable\\.(app|dev)/.*"\nvalidates_with: response_200_check',
    },
    {
      kind: 'other_artifact',
      label: 'その他の公開アーティファクト (理由を添えて)',
      requires_explanation: true,
    },
  ],
  'persona.saas-mvp': [
    {
      kind: 'vercel_url',
      label: 'Vercel に deploy したアプリの URL',
      criteria_yaml: 'url_pattern: "^https://.*\\.vercel\\.app/.*"\nvalidates_with: response_200_check',
    },
    {
      kind: 'github_repo',
      label: 'GitHub の public リポジトリ',
      criteria_yaml: 'url_pattern: "^https://github\\.com/.+/.+"\nvalidates_with: api_check_public',
    },
    {
      kind: 'lovable_url',
      label: 'Lovable で公開した URL',
      criteria_yaml: 'url_pattern: "^https://.*\\.lovable\\.(app|dev)/.*"\nvalidates_with: response_200_check',
    },
    {
      kind: 'other_artifact',
      label: 'その他の公開アーティファクト (理由を添えて)',
      requires_explanation: true,
    },
  ],
  'persona.nonengineer-marketer': [
    {
      kind: 'campaign_lp',
      label: '公開した LP / キャンペーンページの URL',
      criteria_yaml: 'url_pattern: "^https?://.+\\..+"\nvalidates_with: response_200_check',
    },
    {
      kind: 'workflow_recording',
      label: 'AI ワークフロー実行録画 (動画 URL)',
      criteria_yaml: 'url_pattern: "^https?://.+\\..+"\nvalidates_with: response_200_check',
    },
    {
      kind: 'other_artifact',
      label: 'その他の公開アーティファクト (理由を添えて)',
      requires_explanation: true,
    },
  ],
  'persona.designer': [
    {
      kind: 'figma_publish',
      label: '公開した Figma ファイル',
      criteria_yaml: 'url_pattern: "^https://(www\\.)?figma\\.com/(file|design|proto)/.+"\nvalidates_with: response_200_check',
    },
    {
      kind: 'workflow_recording',
      label: 'AI ワークフロー実行録画 (動画 URL)',
      criteria_yaml: 'url_pattern: "^https?://.+\\..+"\nvalidates_with: response_200_check',
    },
    {
      kind: 'other_artifact',
      label: 'その他の公開アーティファクト (理由を添えて)',
      requires_explanation: true,
    },
  ],
}

/**
 * persona × goalDomain で「卒業として認められる成果物 kind」を動的に返す。
 *
 * - persona ID 一致 → 該当 options を返す
 * - persona ID 未知 → web-builder 系をフォールバックとする (Vercel / GitHub / Lovable /
 *   その他)。これは Owner Vision 「Vercel が多いと思う」を反映した実用的デフォルト。
 * - 既存の固定 `WEB_BUILDER_GRADUATION_CRITERIA` 経路は壊さない (本 fn は追加 API)。
 *
 * @param personaId  `persona.web-builder` 等の Persona ID
 * @param goalDomain 任意。将来的に「同じ persona でも goal が SNS マーケなら別 kind」
 *                   を許す拡張点として予約。Phase 1 では使わない。
 */
export function getGraduationOptions(
  personaId: string | null | undefined,
  goalDomain?: string | null,
): GraduationOption[] {
  const trimmed = (personaId ?? '').trim()
  if (trimmed.length > 0) {
    const exact = PERSONA_GRADUATION_OPTIONS[trimmed]
    if (exact) {
      return exact
    }
  }

  // フォールバック: 未知 persona は web-builder の options を返す
  // (Owner Vision: "Vercel が多いと思う" の実用的デフォルト)
  void goalDomain
  return PERSONA_GRADUATION_OPTIONS['persona.web-builder']
}

/**
 * graduation_options の `criteria_yaml` から url_pattern を雑に抜く軽量パーサ。
 * 完全な YAML パースは過剰なので 1 行 regex で済ませる (Phase 1 仕様)。
 */
export function extractUrlPatternFromCriteria(criteriaYaml: string | undefined): RegExp | null {
  if (!criteriaYaml) return null
  // url_pattern: "..."
  const match = criteriaYaml.match(/url_pattern:\s*["']([^"'\n]+)["']/)
  if (!match) return null
  try {
    return new RegExp(match[1])
  } catch {
    return null
  }
}

export interface GraduationGateValidationInput {
  option: GraduationOption
  /** 学習者が提出した URL or アーティファクト識別子 */
  artifactValue: string
  /** other_artifact の自由記述説明 (option.requires_explanation === true の時に必須) */
  explanation?: string
}

export interface GraduationGateValidationResult {
  ok: boolean
  reason: 'ok' | 'empty_value' | 'pattern_mismatch' | 'explanation_required'
}

/**
 * Phase 1 の URL pattern check。Judge sub-agent (TQ-236) が入るまでの暫定版。
 * `other_artifact` は説明文が空でなければ通す (合理性判定は後段)。
 */
export function validateGraduationGateSubmission(
  input: GraduationGateValidationInput,
): GraduationGateValidationResult {
  const value = input.artifactValue.trim()
  if (value.length === 0) {
    return { ok: false, reason: 'empty_value' }
  }

  if (input.option.requires_explanation) {
    const explanation = (input.explanation ?? '').trim()
    if (explanation.length === 0) {
      return { ok: false, reason: 'explanation_required' }
    }
    // other_artifact: pattern 拘束は外し、説明があれば通す (合理性判定は TQ-236)
    return { ok: true, reason: 'ok' }
  }

  const pattern = extractUrlPatternFromCriteria(input.option.criteria_yaml)
  if (pattern && !pattern.test(value)) {
    return { ok: false, reason: 'pattern_mismatch' }
  }
  return { ok: true, reason: 'ok' }
}

// ── Graduation Criteria types ──

export interface GraduationCriterion {
  id: string
  label: string
  description: string
  /** Evidence rule keywords to match against milestone evidence_rule or artifact content */
  keywords: string[]
}

// ── web-builder-ai graduation criteria (要件 8.3) ──

export const WEB_BUILDER_GRADUATION_CRITERIA: GraduationCriterion[] = [
  {
    id: 'git-nextjs',
    label: 'Git 管理された Next.js アプリ',
    description: 'Git リポジトリで管理された Next.js プロジェクトが存在する',
    keywords: ['git', 'next.js', 'nextjs', 'リポジトリ'],
  },
  {
    id: 'ai-coding-tool',
    label: 'AI コーディングツールが使える状態',
    description: 'Claude Code、Codex、または同等の local AI coding workflow を使える',
    keywords: ['claude code', 'codex', 'ai tool', 'ai coding', 'gemini cli', 'ツール'],
  },
  {
    id: 'ai-tool-reasoning',
    label: 'AI ツール選定理由を説明できる',
    description: '推薦された AI tool を選んだ理由を理解し説明できる',
    keywords: ['選定', '理由', '選んだ', 'ツール選び'],
  },
  {
    id: 'tailwind-shadcn-ui',
    label: 'Tailwind CSS + shadcn/ui の UI',
    description: 'Tailwind CSS と shadcn/ui を利用した presentable な UI がある',
    keywords: ['tailwind', 'shadcn', 'ui', 'デザイン', 'スタイル'],
  },
  {
    id: 'supabase-workflow',
    label: 'Supabase ワークフロー',
    description: 'Supabase を用いた実データまたは auth workflow が 1 つ以上ある',
    keywords: ['supabase', 'auth', 'データベース', 'database'],
  },
  {
    id: 'vercel-deploy',
    label: 'Vercel デプロイ済み',
    description: 'Vercel に deploy され、live URL が確認できる',
    keywords: ['vercel', 'deploy', 'デプロイ', 'live url', '公開'],
  },
  {
    id: 'stack-understanding',
    label: 'スタックの主要役割を説明できる',
    description: 'ユーザーが stack の主要役割を説明できる',
    keywords: ['stack', 'スタック', '役割', '説明'],
  },
]

/** @deprecated Use WEB_BUILDER_GRADUATION_CRITERIA or getGraduationCriteriaForTrack() */
export const GRADUATION_CRITERIA = WEB_BUILDER_GRADUATION_CRITERIA

// ── ai-automation graduation criteria (TQ-34 extensibility validation) ──

export const AI_AUTOMATION_GRADUATION_CRITERIA: GraduationCriterion[] = [
  {
    id: 'ai-chat-skill',
    label: 'AIチャットを業務に活用できる',
    description: 'AIチャットツールで情報整理・文章作成・要約ができる',
    keywords: ['aiチャット', 'chatgpt', 'claude', '要約', '文章作成', 'チャット活用'],
  },
  {
    id: 'automation-scope',
    label: '自動化対象タスクが特定されている',
    description: '自動化すべき業務タスクが文書化され業務フローが設計されている',
    keywords: ['自動化', '対象', 'タスク', '棚卸し', 'automation', '業務フロー', 'ワークフロー設計'],
  },
  {
    id: 'python-env',
    label: 'Python 実行環境が動作する',
    description: 'Python がインストールされスクリプトが実行できる',
    keywords: ['python', 'pip', 'インストール', '環境構築'],
  },
  {
    id: 'ai-api-connected',
    label: 'AI API に接続できる',
    description: 'Claude API や OpenAI API への接続が設定され API コールが動作する',
    keywords: ['api', 'claude', 'openai', 'ai', '接続', 'キー', 'apiコール', 'リクエスト'],
  },
  {
    id: 'prompt-engineering',
    label: '効果的なプロンプトを設計できる',
    description: '目的に応じたプロンプトを設計し AI の出力品質を制御できる',
    keywords: ['プロンプト', 'prompt', 'few-shot', '指示設計', 'プロンプトエンジニアリング'],
  },
  {
    id: 'automation-script',
    label: '自動化スクリプトが動作する',
    description: '1 つ以上の業務タスクを自動化するスクリプトが正常に動作する',
    keywords: ['スクリプト', 'script', '自動実行', '動作確認', 'ワークフロー構築', 'パイプライン'],
  },
  {
    id: 'scheduled-execution',
    label: '定期実行が設定されている',
    description: 'cron やタスクスケジューラで自動実行が設定されている',
    keywords: ['cron', 'スケジュール', '定期実行', 'schedule', 'タスクスケジューラ'],
  },
]

// ── ai-content-creator graduation criteria (TQ-96) ──

export const AI_CONTENT_CREATOR_GRADUATION_CRITERIA: GraduationCriterion[] = [
  {
    id: 'ai-writing-basics',
    label: 'AIで文章を生成・編集できる',
    description: 'AIチャットツールで目的に応じた文章を生成・編集できる',
    keywords: ['aiライティング', '文章生成', 'ライティング', 'ai 文章', 'テキスト生成', '編集'],
  },
  {
    id: 'content-prompt-skill',
    label: 'コンテンツ制作用プロンプトを設計できる',
    description: 'ペルソナ・トーン・構成・出力形式を指定したプロンプトを設計できる',
    keywords: ['プロンプト', 'prompt', 'ペルソナ', 'トーン', '構成', 'テンプレート'],
  },
  {
    id: 'text-content-created',
    label: 'テキストコンテンツを制作できる',
    description: 'ブログ記事・SNS投稿・教材のいずれかをAIで制作できる',
    keywords: ['ブログ', '記事', 'sns', '教材', '投稿', 'コンテンツ制作'],
  },
  {
    id: 'ai-image-skill',
    label: 'AI画像生成を活用できる',
    description: 'AI画像生成ツールでコンテンツ用ビジュアルを制作できる',
    keywords: ['画像生成', 'dall-e', 'midjourney', 'アイキャッチ', 'ビジュアル', 'ai画像'],
  },
  {
    id: 'presentation-skill',
    label: 'プレゼン資料をAIで制作できる',
    description: 'AIを使ってストーリー構成とスライドを制作できる',
    keywords: ['プレゼン', 'スライド', '資料', 'presentation', 'ストーリー'],
  },
  {
    id: 'content-workflow-ready',
    label: 'コンテンツ制作ワークフローが整備されている',
    description: 'テンプレート・チェックリスト・スケジュールを含むワークフローが構築されている',
    keywords: ['ワークフロー', 'テンプレート', 'チェックリスト', 'スケジュール', '運用'],
  },
]

// ── ai-app-builder graduation criteria (TQ-98) ──

export const AI_APP_BUILDER_GRADUATION_CRITERIA: GraduationCriterion[] = [
  {
    id: 'app-requirements-defined',
    label: 'アプリ要件が定義されている',
    description: 'AIを使って要件定義ドキュメントとデータモデルが設計されている',
    keywords: ['要件定義', 'データモデル', 'er図', 'テーブル設計', 'mvp', '要件', 'requirements'],
  },
  {
    id: 'crud-working',
    label: 'CRUD操作が動作する',
    description: 'データの作成・読取・更新・削除がAPIで動作する',
    keywords: ['crud', 'create', 'read', 'update', 'delete', 'データ操作', 'supabase'],
  },
  {
    id: 'auth-implemented',
    label: '認証フローが動作する',
    description: 'サインアップ・ログイン・ログアウトが動作する',
    keywords: ['auth', '認証', 'ログイン', 'サインアップ', 'セッション', 'authentication'],
  },
  {
    id: 'api-designed',
    label: 'APIが設計・実装されている',
    description: 'RESTful APIが設計されバリデーション付きで動作する',
    keywords: ['api', 'rest', 'エンドポイント', 'バリデーション', 'api routes'],
  },
  {
    id: 'ui-prototype-built',
    label: 'UIプロトタイプが完成している',
    description: 'ユーザーが操作できるUIが完成しバックエンドと連携している',
    keywords: ['ui', 'プロトタイプ', 'コンポーネント', 'フロントエンド', 'react', 'prototype'],
  },
  {
    id: 'app-deployed',
    label: 'アプリがデプロイされている',
    description: 'Vercelにデプロイされ公開URLで動作する',
    keywords: ['vercel', 'deploy', 'デプロイ', '公開', 'live url', '本番'],
  },
]

export interface GraduationCriterionResult {
  criterion: GraduationCriterion
  met: boolean
  source: string | null
}

export interface GraduationCheckResult {
  allMilestonesCompleted: boolean
  completedMilestoneCount: number
  totalMilestoneCount: number
  criteria: GraduationCriterionResult[]
  graduated: boolean
  completedAt: string | null
}

// ── Evidence-based graduation types ──

export interface CompetencyScore {
  capabilityId: string
  capabilityLabel: string
  score: number
  meetsThreshold: boolean
}

export interface EvidenceBasedGraduationResult {
  graduated: boolean
  allNodesHaveEvidence: boolean
  nodesWithEvidence: number
  totalRequiredNodes: number
  competencyScores: CompetencyScore[]
  allCompetenciesMet: boolean
  completedAt: string | null
}

/**
 * Evidence-based graduation check.
 *
 * Instead of keyword matching against milestone text, this checks:
 * 1. All required plan nodes have at least one evidence_submission
 * 2. All competency assessments meet the score threshold (>= 70)
 *
 * @param planNodes - Plan nodes for the active plan
 * @param evidenceSubmissions - Evidence submissions for the user
 * @param competencyAssessments - Competency assessment scores
 * @param capabilities - Capabilities linked to the goal's domains
 * @param threshold - Minimum competency score to pass (default 70)
 */
export function checkEvidenceBasedGraduation(
  planNodes: Array<{ id: string; status: string; lesson_id: string }>,
  evidenceSubmissions: Array<{ plan_node_id?: string | null; lesson_id: string }>,
  competencyAssessments: Array<{ capability_id: string; score: number }>,
  capabilities: Array<{ id: string; label: string }>,
  threshold = 70,
): EvidenceBasedGraduationResult {
  // 1. Check evidence coverage — all non-skipped nodes need evidence
  const requiredNodes = planNodes.filter((n) => n.status !== 'skipped')
  const evidenceNodeIds = new Set(
    evidenceSubmissions
      .filter((e) => e.plan_node_id)
      .map((e) => e.plan_node_id!),
  )
  const evidenceLessonIds = new Set(
    evidenceSubmissions.map((e) => e.lesson_id),
  )

  // A node is covered if it has direct evidence OR its lesson has evidence
  const nodesWithEvidence = requiredNodes.filter(
    (n) => evidenceNodeIds.has(n.id) || evidenceLessonIds.has(n.lesson_id),
  ).length
  const allNodesHaveEvidence = requiredNodes.length > 0 && nodesWithEvidence === requiredNodes.length

  // 2. Check competency scores
  const assessmentByCapability = new Map(
    competencyAssessments.map((a) => [a.capability_id, a.score]),
  )

  const competencyScores: CompetencyScore[] = capabilities.map((cap) => {
    const score = assessmentByCapability.get(cap.id) ?? 0
    return {
      capabilityId: cap.id,
      capabilityLabel: cap.label,
      score,
      meetsThreshold: score >= threshold,
    }
  })

  const allCompetenciesMet =
    competencyScores.length > 0 && competencyScores.every((c) => c.meetsThreshold)

  const graduated = allNodesHaveEvidence && allCompetenciesMet

  return {
    graduated,
    allNodesHaveEvidence,
    nodesWithEvidence,
    totalRequiredNodes: requiredNodes.length,
    competencyScores,
    allCompetenciesMet,
    completedAt: graduated ? new Date().toISOString() : null,
  }
}

/**
 * Check graduation status by examining milestone_progress and artifacts
 * against graduation criteria.
 *
 * @param criteriaOverride - Pass track-specific criteria. Falls back to WEB_BUILDER_GRADUATION_CRITERIA for backward compat.
 */
export function checkGraduation(
  milestones: PlannerPlanMilestone[],
  milestoneProgress: MilestoneProgress[],
  artifacts: PlannerArtifact[],
  criteriaOverride?: GraduationCriterion[],
): GraduationCheckResult {
  const totalMilestoneCount = milestones.length
  const completedMilestoneIds = new Set(
    milestoneProgress
      .filter((mp) => mp.status === 'completed')
      .map((mp) => mp.milestone_id)
  )
  const completedMilestoneCount = milestones.filter((m) =>
    completedMilestoneIds.has(m.id)
  ).length
  const allMilestonesCompleted =
    totalMilestoneCount > 0 && completedMilestoneCount === totalMilestoneCount

  // Build a searchable text corpus from evidence rules, verification summaries, and artifacts
  const evidenceTexts = milestoneProgress.map((mp) =>
    [mp.evidence_rule, mp.verification_summary, mp.milestone_title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  )
  const artifactTexts = artifacts.map((a) =>
    [a.title, a.content, a.milestone_title, a.step_title]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  )
  const milestoneTexts = milestones.map((m) =>
    [m.title, m.description, m.evidenceRule, m.artifactGoal]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  )
  const allTexts = [...evidenceTexts, ...artifactTexts, ...milestoneTexts]

  const activeCriteria = criteriaOverride ?? WEB_BUILDER_GRADUATION_CRITERIA
  const criteria: GraduationCriterionResult[] = activeCriteria.map(
    (criterion) => {
      const met = criterion.keywords.some((keyword) =>
        allTexts.some((text) => text.includes(keyword.toLowerCase()))
      )

      // Find the source that matched
      let source: string | null = null
      if (met) {
        for (const mp of milestoneProgress) {
          const text = [mp.evidence_rule, mp.verification_summary, mp.milestone_title]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (criterion.keywords.some((k) => text.includes(k.toLowerCase()))) {
            source = mp.milestone_title ?? mp.milestone_id
            break
          }
        }
        if (!source) {
          for (const a of artifacts) {
            const text = [a.title, a.content].filter(Boolean).join(' ').toLowerCase()
            if (criterion.keywords.some((k) => text.includes(k.toLowerCase()))) {
              source = a.title ?? a.content.slice(0, 50)
              break
            }
          }
        }
      }

      return { criterion, met, source }
    }
  )

  const allCriteriaMet = criteria.every((c) => c.met)
  const graduated = allMilestonesCompleted && allCriteriaMet

  // Find the latest verified_at timestamp as completion date
  const completedAt = graduated
    ? milestoneProgress
        .filter((mp) => mp.verified_at)
        .map((mp) => mp.verified_at!)
        .sort()
        .pop() ?? new Date().toISOString()
    : null

  return {
    allMilestonesCompleted,
    completedMilestoneCount,
    totalMilestoneCount,
    criteria,
    graduated,
    completedAt,
  }
}
