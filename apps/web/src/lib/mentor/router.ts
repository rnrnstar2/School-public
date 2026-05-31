/**
 * Mentor Multi-Provider Router — TQ-227 / W16 (adaptive multi-model routing)
 *
 * `pickModelFor(role, availableProviders?)` is the Model Routing factory that
 * Conductor / sub-agent fan-out uses. It resolves an `AgentRole` to a real
 * provider + model and supports env-based overrides, kill-switch, fallback
 * chain, and W16 adaptive selection driven by the learner's BYOK key set.
 *
 * 設計指針:
 * - 本ファイルは **factory + config 抽象のみ**。Provider client（Anthropic SDK
 *   / OpenAI SDK / Gemini SDK / ZAI fetch / xAI fetch）は呼ばない。実呼び出し
 *   は Conductor 側で `getApiKeyForUser`（BYOK / TQ-226）と組み合わせて配線。
 * - kill-switch: env `MENTOR_MODEL_FALLBACK_ALL_GLM=1` の時、全 role を
 *   `{ provider: 'zai', model: 'glm-5.1' }` に倒す。Multi-provider 障害時の
 *   緊急退避経路として使用する。
 * - 個別 override: env `MENTOR_MODEL_<ROLE>=...` で role 単位の model 指定を
 *   許可する（コスト削減 / 実験用）。形式は `provider:model`（例:
 *   `MENTOR_MODEL_CONDUCTOR=anthropic:claude-sonnet-4-6`）。`provider:` を
 *   省略した場合は role の default provider を流用する。
 * - default routing は `.agent-work/2026-05-08_mentor-quality/investigator-11.md`
 *   「モデルルーティング表」に従う。
 *
 * W16 adaptive routing:
 * - Owner directive (2026-05-09):
 *     「複数の AI モデルを全て持っている人も少ないから設定されているものの中
 *      から適宜選んで サブエージェントは使うと良いね。Gemini は検索系とか強
 *      いし X は最新のトレンドとか強いしね」
 * - 学習者は BYOK で 0..N provider key を登録する。全 provider を持つ人は少
 *   ない。`pickModelFor(role, availableProviders)` の第2引数に登録 provider
 *   集合を渡すと、`ROLE_PREFERRED_PROVIDERS[role]` に沿って **持っている中で
 *   最良の provider** を選ぶ。
 * - 第2引数を渡さない caller は従来通り `DEFAULT_ROUTING` で動く（後方互換）。
 *
 * Inv-11 G1 critical: 既存 `apps/web/src/lib/planner/zai.ts` は単一 endpoint・
 * 単一 model 固定で multi-model fan-out の前提を欠いていた。本 router がその
 * 前提を提供する。
 */

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'zai' | 'xai'

export type AgentRole =
  /** 全体指揮 (state machine driver) — claude-opus-4-7 (1M context). */
  | 'conductor'
  /** Goal Tree decomposer — claude-sonnet-4-6. */
  | 'goal_tree'
  /** Tech-stack scout (web grounding) — gemini-pro-3 + websearch. */
  | 'tech_scout'
  /** AI tool catalog scout — gpt-5.x (ChatGPT) or gemini-pro-3. */
  | 'tool_scout'
  /**
   * Trend / news scout (W16) — X (Grok) 優先。`tech_scout` が「構造化された
   * 技術スタック調査」なのに対し、`trend_scout` は「最新トレンド・SNS発信・
   * 1~2週間以内の話題」など realtime / social-trend を主目的とする。X (Grok)
   * は X プラットフォームと直結しているため得意領域。Gemini は web 検索で
   * 補完、OpenAI は 3rd fallback。
   */
  | 'trend_scout'
  /** Non-engineer friction critic — claude-sonnet-4-6. */
  | 'non_eng_critic'
  /** Shortest-path planner — claude-haiku-4-5-20251001 or codex-mini. */
  | 'path_planner'
  /** Lesson-fit matcher (pgvector first, LLM optional) — glm-5.1. */
  | 'lesson_matcher'
  /** Mentor memory recall (summarize only) — claude-haiku-4-5-20251001. */
  | 'memory_recall'
  /** Plan judge × 3 self-consistency — claude-sonnet-4-6. */
  | 'judge'
  /** Conflict resolver with extended thinking — claude-opus-4-7. */
  | 'tie_breaker'

export type ModelConfig = {
  provider: Provider
  model: string
  maxTokens?: number
  temperature?: number
  /** Extended thinking budget (Anthropic) — typically only used by tie_breaker. */
  thinking?: { budget: number }
  /**
   * 障害時の fallback chain。先頭から順に試行する想定で、Conductor 側で
   * provider client が落ちた場合に次へ送る。本 factory はチェーンを構築する
   * のみで、実際の retry policy は TQ-228 で実装する。
   */
  fallbackChain?: ModelConfig[]
}

/**
 * Provider 強み (capability tags) 一覧。Adaptive routing が role × provider
 * を解決する際の "なぜそれを選ぶのか" を表現するためのドキュメンテーション
 * 兼テスト固定値。`ROLE_PREFERRED_PROVIDERS` の優先順位はこの強みに基づく。
 *
 * 値は意味的タグの読み取り専用配列で、UI や Settings hint にも引用される。
 */
export const PROVIDER_STRENGTHS: Record<Provider, readonly string[]> = {
  anthropic: ['code', 'reasoning', 'integration', 'extended-thinking'],
  openai: ['general', 'tool-use', 'cost-efficient-large'],
  gemini: ['search', 'realtime-info', 'large-context', 'web-grounding'],
  zai: ['ja-conversation', 'cost-efficient', 'glm-routing'],
  xai: ['social-trend', 'realtime-x', 'controversy-tolerant'],
} as const

/**
 * Role × Provider 推奨順。`pickModelFor(role, availableProviders)` は
 * `availableProviders` に登場する **最初の** provider を採用する（左ほど優先）。
 *
 * 順位の根拠は `PROVIDER_STRENGTHS` と Inv-11 routing 表:
 *   - conductor / goal_tree / non_eng_critic: code+reasoning 優位 → anthropic
 *     fallback openai → cost で zai
 *   - tech_scout: web-grounding が core → gemini → anthropic → openai
 *   - tool_scout: tool-use 強い openai → gemini → anthropic
 *   - trend_scout (W16 NEW): X 直結が core → xai → 検索で gemini → openai
 *   - path_planner: 軽量 reasoning → anthropic (haiku) → zai → openai
 *   - lesson_matcher: 日本語 + cost → zai → gemini (large-context) → anthropic
 *   - memory_recall: 短文要約 → anthropic (haiku) → zai → openai
 *   - judge: 厳密推論 → anthropic → openai (zai は ja-bias 強で不向き)
 *   - tie_breaker: extended-thinking 必須 → anthropic only
 */
export const ROLE_PREFERRED_PROVIDERS: Record<AgentRole, readonly Provider[]> = {
  conductor: ['anthropic', 'openai', 'zai'],
  goal_tree: ['anthropic', 'openai', 'zai'],
  tech_scout: ['gemini', 'anthropic', 'openai'],
  tool_scout: ['openai', 'gemini', 'anthropic'],
  // W16: X (Grok) で realtime social-trend, Gemini で web 検索補完
  trend_scout: ['xai', 'gemini', 'openai'],
  non_eng_critic: ['anthropic', 'openai', 'zai'],
  path_planner: ['anthropic', 'zai', 'openai'],
  lesson_matcher: ['zai', 'gemini', 'anthropic'],
  memory_recall: ['anthropic', 'zai', 'openai'],
  judge: ['anthropic', 'openai'],
  tie_breaker: ['anthropic'],
} as const

/**
 * 全 role を緊急退避させる kill-switch ターゲット。Multi-provider が同時障害
 * した際に owner が `MENTOR_MODEL_FALLBACK_ALL_GLM=1` で切り替える。
 */
const GLM_FALLBACK: ModelConfig = {
  provider: 'zai',
  model: 'glm-5.1',
}

/**
 * Default routing 表。Inv-11 「モデルルーティング表」に対応。
 * 個別 override が無い場合のみ使用される。
 *
 * W16 で `trend_scout` 追加。xai SDK / API URL は確定していないので model 値
 * は推奨 (`grok-4`) で TODO comment を残す。実 fetch 配線は別 TQ。
 */
const DEFAULT_ROUTING: Record<AgentRole, ModelConfig> = {
  conductor: {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    maxTokens: 8192,
    temperature: 0.4,
  },
  goal_tree: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    maxTokens: 4096,
    temperature: 0.5,
  },
  tech_scout: {
    provider: 'gemini',
    model: 'gemini-pro-3',
    maxTokens: 4096,
    temperature: 0.3,
  },
  tool_scout: {
    provider: 'openai',
    model: 'gpt-5.x',
    maxTokens: 4096,
    temperature: 0.3,
  },
  trend_scout: {
    provider: 'xai',
    // TODO(W16+): xAI SDK / API endpoint が未確定 (2026-05-09)。
    // `grok-4` は推奨値。実 fetch 配線時に `grok-2-latest` 等に差し替える可
    // 能性あり。env override (`MENTOR_MODEL_TREND_SCOUT`) で実験的に上書き
    // できる経路を確保済み。
    model: 'grok-4',
    maxTokens: 4096,
    temperature: 0.4,
  },
  non_eng_critic: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    maxTokens: 4096,
    temperature: 0.6,
  },
  path_planner: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2048,
    temperature: 0.2,
  },
  lesson_matcher: {
    provider: 'zai',
    model: 'glm-5.1',
    maxTokens: 2048,
    temperature: 0.2,
  },
  memory_recall: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2048,
    temperature: 0.3,
  },
  judge: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    maxTokens: 2048,
    temperature: 0.0,
  },
  tie_breaker: {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    maxTokens: 8192,
    temperature: 0.2,
    thinking: { budget: 8000 },
  },
}

/**
 * Provider × 推奨 model のフォールバック表。Adaptive routing が DEFAULT 表に
 * 載っていない provider を選んだ場合の model 推定に使う。
 *
 * 例: role=conductor の DEFAULT は anthropic だが、学習者が openai key だけ
 * を持っているとき `openai → gpt-5.x` を採用する。
 */
const ROLE_PROVIDER_MODEL_HINTS: Partial<
  Record<AgentRole, Partial<Record<Provider, string>>>
> = {
  conductor: {
    anthropic: 'claude-opus-4-7',
    openai: 'gpt-5.x',
    zai: 'glm-5.1',
  },
  goal_tree: {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-5.x',
    zai: 'glm-5.1',
  },
  tech_scout: {
    gemini: 'gemini-pro-3',
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-5.x',
  },
  tool_scout: {
    openai: 'gpt-5.x',
    gemini: 'gemini-pro-3',
    anthropic: 'claude-sonnet-4-6',
  },
  trend_scout: {
    xai: 'grok-4',
    gemini: 'gemini-pro-3',
    openai: 'gpt-5.x',
  },
  non_eng_critic: {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-5.x',
    zai: 'glm-5.1',
  },
  path_planner: {
    anthropic: 'claude-haiku-4-5-20251001',
    zai: 'glm-5.1',
    openai: 'gpt-5.x',
  },
  lesson_matcher: {
    zai: 'glm-5.1',
    gemini: 'gemini-pro-3',
    anthropic: 'claude-haiku-4-5-20251001',
  },
  memory_recall: {
    anthropic: 'claude-haiku-4-5-20251001',
    zai: 'glm-5.1',
    openai: 'gpt-5.x',
  },
  judge: {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-5.x',
  },
  tie_breaker: {
    anthropic: 'claude-opus-4-7',
  },
}

/**
 * Role → env var 名のマッピング。`pickModelFor` は env が立っていれば
 * default を上書きする。形式は `provider:model` か `model` のみ。
 *   - `MENTOR_MODEL_CONDUCTOR=anthropic:claude-sonnet-4-6`
 *   - `MENTOR_MODEL_GOAL_TREE=glm-5.1`（provider 省略時は default 流用）
 */
const ROLE_ENV_KEYS: Record<AgentRole, string> = {
  conductor: 'MENTOR_MODEL_CONDUCTOR',
  goal_tree: 'MENTOR_MODEL_GOAL_TREE',
  tech_scout: 'MENTOR_MODEL_TECH_SCOUT',
  tool_scout: 'MENTOR_MODEL_TOOL_SCOUT',
  trend_scout: 'MENTOR_MODEL_TREND_SCOUT',
  non_eng_critic: 'MENTOR_MODEL_NON_ENG_CRITIC',
  path_planner: 'MENTOR_MODEL_PATH_PLANNER',
  lesson_matcher: 'MENTOR_MODEL_LESSON_MATCHER',
  memory_recall: 'MENTOR_MODEL_MEMORY_RECALL',
  judge: 'MENTOR_MODEL_JUDGE',
  tie_breaker: 'MENTOR_MODEL_TIE_BREAKER',
}

const VALID_PROVIDERS: readonly Provider[] = [
  'anthropic',
  'openai',
  'gemini',
  'zai',
  'xai',
]

function isProvider(value: string): value is Provider {
  return (VALID_PROVIDERS as readonly string[]).includes(value)
}

/**
 * `MENTOR_MODEL_<ROLE>` 形式の env を ModelConfig override にパースする。
 * 不正な値は `null` を返し、default にフォールバックさせる。
 */
function parseRoleEnv(raw: string | undefined, fallback: ModelConfig): ModelConfig | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // `provider:model` 形式
  const colonIdx = trimmed.indexOf(':')
  if (colonIdx > 0) {
    const provider = trimmed.slice(0, colonIdx).trim()
    const model = trimmed.slice(colonIdx + 1).trim()
    if (!isProvider(provider) || !model) return null
    return { ...fallback, provider, model }
  }

  // model のみ（provider は default 流用）
  return { ...fallback, model: trimmed }
}

/**
 * Default の cross-provider fallback chain を構築する。
 * Provider 障害時の優先順位は: 同一 provider の縮退 → 別 provider 同等 → GLM。
 *
 * 本 factory はチェーンの形だけ提供し、実際の retry / circuit breaker は
 * TQ-228 で実装する。
 */
function buildDefaultFallbackChain(primary: ModelConfig): ModelConfig[] {
  const chain: ModelConfig[] = []

  // Anthropic 系は Sonnet → Haiku の縮退を許す
  if (primary.provider === 'anthropic') {
    if (!primary.model.includes('sonnet')) {
      chain.push({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
    }
    if (!primary.model.includes('haiku')) {
      chain.push({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' })
    }
  }

  // 最終手段は常に GLM
  if (!(primary.provider === GLM_FALLBACK.provider && primary.model === GLM_FALLBACK.model)) {
    chain.push(GLM_FALLBACK)
  }

  return chain
}

/**
 * Adaptive routing: `availableProviders` から `ROLE_PREFERRED_PROVIDERS[role]`
 * の優先順で最初に登場する provider を選ぶ。該当なし or 未指定なら null を
 * 返す（呼び出し側が DEFAULT_ROUTING にフォールバックする）。
 *
 * `availableProviders` が空配列の場合（= 学習者が key を 1 つも登録してい
 * ない）は null を返し、DEFAULT で動く（envoy/server 側の API key を使う前
 * 提）。空配列を「強制 GLM」と解釈しないのは、全社 key を未登録でも server
 * 側が運用キーで動かしたいケース（admin / 体験プレビュー）があるため。
 */
function pickFromAvailable(
  role: AgentRole,
  availableProviders: readonly Provider[] | undefined,
): ModelConfig | null {
  if (!availableProviders || availableProviders.length === 0) return null

  const preferred = ROLE_PREFERRED_PROVIDERS[role]
  const availableSet = new Set(availableProviders)
  const winner = preferred.find((p) => availableSet.has(p))
  if (!winner) return null

  const defaultCfg = DEFAULT_ROUTING[role]

  // DEFAULT の provider と一致するなら DEFAULT をそのまま使う（maxTokens /
  // temperature / thinking 等の knob 保存）。
  if (winner === defaultCfg.provider) {
    return { ...defaultCfg }
  }

  // 別 provider に振り替えるときは ROLE_PROVIDER_MODEL_HINTS で model を
  // 推定し、knob は DEFAULT を引き継ぐ。
  const model = ROLE_PROVIDER_MODEL_HINTS[role]?.[winner]
  if (!model) {
    // hint table 未定義 → DEFAULT に戻す（保守的）
    return null
  }
  return {
    provider: winner,
    model,
    maxTokens: defaultCfg.maxTokens,
    temperature: defaultCfg.temperature,
    thinking: defaultCfg.thinking,
  }
}

/**
 * 指定 role に対する ModelConfig を解決する。
 *
 * 解決順:
 *   1. `MENTOR_MODEL_FALLBACK_ALL_GLM=1` → 無条件に GLM-5.1
 *   2. `MENTOR_MODEL_<ROLE>` env → default を override
 *   3. **adaptive (W16)**: `availableProviders` が指定されていれば
 *      `ROLE_PREFERRED_PROVIDERS[role]` の優先順で持っている最良の provider
 *      を採用
 *   4. default routing 表
 *
 * いずれの場合も `fallbackChain` を必ず付与する（kill-switch 経由は除く、
 * 既に最終 fallback 自身なので不要）。
 *
 * @param role         Agent role を指定
 * @param availableProviders  学習者が BYOK で key 登録済みの provider
 *                            集合（W16）。未指定なら従来挙動。
 */
export function pickModelFor(
  role: AgentRole,
  availableProviders?: readonly Provider[],
): ModelConfig {
  // 1. Kill-switch
  if (process.env.MENTOR_MODEL_FALLBACK_ALL_GLM === '1') {
    return { ...GLM_FALLBACK }
  }

  const fallback = DEFAULT_ROUTING[role]

  // 2. Per-role override
  const override = parseRoleEnv(process.env[ROLE_ENV_KEYS[role]], fallback)
  if (override) {
    return {
      ...override,
      fallbackChain: buildDefaultFallbackChain(override),
    }
  }

  // 3. Adaptive (W16)
  const adaptive = pickFromAvailable(role, availableProviders)
  if (adaptive) {
    return {
      ...adaptive,
      fallbackChain: buildDefaultFallbackChain(adaptive),
    }
  }

  // 4. Default routing
  return {
    ...fallback,
    fallbackChain: buildDefaultFallbackChain(fallback),
  }
}

/**
 * テスト・デバッグ用の純粋ビュー。default 表をそのまま返す（mutation 不可）。
 */
export function getDefaultRoutingTable(): Readonly<Record<AgentRole, ModelConfig>> {
  return DEFAULT_ROUTING
}
