/**
 * AI Tools Catalog — canonical source of truth for AI tool metadata.
 *
 * Used by:
 * - `GoalIntakeWizard` (step 2 tool selection) to render the checkbox list
 * - `AiToolLaunchCard` (/plan page) to render launch guidance per selected tool
 * - Plan compiler / Mentor (TQ-220 / TQ-221) to pick a tool per step / atom
 *   based on AI product characteristics (strengths, primary use cases, etc.)
 *
 * Keep this file as the single place to add/remove tools. Copy in Japanese.
 *
 * IMPORTANT: `id` values are persisted in `goals.preferred_tools` and
 * `learner_profile.available_ai_tools`. Do not rename existing ids; add new
 * ids only.
 */

export type AiToolLaunchKind = 'terminal' | 'desktop' | 'web' | 'freeform'

/** High-level product category — what kind of AI surface the tool exposes. */
export type AiToolCategory =
  | 'cli-agent' // Terminal-resident AI coder (Claude Code / Codex CLI / Gemini CLI)
  | 'ide-agent' // Desktop IDE w/ embedded AI agent (Cursor / Windsurf)
  | 'browser-builder' // Browser one-shot UI/app generator (v0 / Bolt / Lovable)
  | 'autonomous' // Autonomous agent ("delegate full tasks") (Devin / Replit Agent)
  | 'workspace' // Long-context chat workspace (Claude Projects / ChatGPT)
  | 'freeform' // Catch-all bucket for tools not in the catalog

export type AiToolProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'cursor'
  | 'vercel'
  | 'stackblitz'
  | 'lovable'
  | 'cognition'
  | 'replit'
  | 'codeium'
  | 'other'

/** Pricing tier — coarse bucket. `notes` carries the human-readable detail. */
export type AiToolCostTier =
  | 'free' // Fully free / OSS
  | 'paid-low' // ~$10-20 / month entry plan or pay-as-you-go small spend
  | 'paid-mid' // ~$20-50 / month
  | 'paid-high' // $100+ / month or enterprise-only
  | 'usage-based' // Pay per API token / per task; cost depends on usage

export interface AiToolCost {
  tier: AiToolCostTier
  notes: string
}

/**
 * Non-engineer friendliness on a 1..5 scale.
 *
 * - 1: 要 CLI / dev 知識（Claude Code / Codex CLI 等）
 * - 2: ローカルインストール + 軽い設定（Cursor / Windsurf 等）
 * - 3: アカウント作成 + 軽い学習で使える
 * - 4: ブラウザだけで完結、軽いプロンプトのみ
 * - 5: ブラウザだけで完結、ほぼワンクリックで成果物が出る
 */
export type AiToolNonEngineerFriendliness = 1 | 2 | 3 | 4 | 5

/**
 * Use-case tags — Plan compiler / Mentor uses these to pick a tool for
 * a given step / atom. Keep the vocabulary small and stable; extend
 * deliberately after Owner review.
 */
export type AiToolUseCase =
  | 'scaffold-ui' // 画面の見た目を生成
  | 'scaffold-app' // フルスタックアプリの雛形を生成
  | 'feature-implementation' // 機能を 1 本実装する
  | 'codebase-refactor' // 既存コードベースを横断的に書き換える
  | 'long-context-refactor' // 大きなレポを長文 context で扱う
  | 'one-shot-task' // 1 ショットで小タスクを片付ける
  | 'autonomous-task' // 自律的に複数 step を実行
  | 'deploy' // デプロイ・公開
  | 'data-analysis' // データ分析・SQL
  | 'image-gen' // 画像生成
  | 'document-writing' // 文書作成・要約
  | 'research' // 調査・要件整理
  | 'code-review' // コードレビュー
  | 'pair-programming' // 対話しながらコードを書く

export interface AiToolCatalogEntry {
  /** Stable identifier stored in `goals.preferred_tools` + `learner_profile.available_ai_tools` */
  id: string
  /** Human-readable label shown in UI (wizard + card) */
  label: string
  /** Short description of what the tool is / how to get value from it */
  description: string
  /** How the user launches the tool — determines which steps/command are shown */
  kind: AiToolLaunchKind
  /** High-level product category (cli-agent / ide-agent / browser-builder / ...) */
  category: AiToolCategory
  /** Vendor / company providing the tool */
  provider: AiToolProvider
  /** Terminal command to run, if `kind === 'terminal'` */
  command?: string
  /** Homepage / download link (nullable for `freeform`) */
  homepage?: string
  /** Step-by-step launch instructions shown in the card */
  steps: string[]
  /** Same content as `steps` (alias) — kept for forward compatibility with TQ-220 callers */
  launchSteps?: string[]
  /** What this tool is good at (3-5 items) */
  strengths: string[]
  /** What this tool is bad at (2-4 items) */
  weaknesses: string[]
  /** Pricing bucket + notes */
  cost: AiToolCost
  /** 1..5: how friendly to non-engineers */
  nonEngineerFriendliness: AiToolNonEngineerFriendliness
  /** Primary use cases — drives Planner / Mentor matching */
  primaryUseCases: AiToolUseCase[]
}

const SHARED_TERMINAL_STEPS = [
  'ターミナル（コマンドプロンプト）を開く',
  'プロジェクトフォルダに移動する',
  '以下のコマンドを入力して Enter',
]

/**
 * Ordered list — display order in the wizard and card follows this array
 * when the user selects multiple tools.
 *
 * NOTE: do not rename `id` for existing entries (persisted in DB).
 */
export const AI_TOOLS_CATALOG: readonly AiToolCatalogEntry[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    description: 'ターミナルで Claude Code を起動して、AI にコードを書いてもらいましょう',
    kind: 'terminal',
    category: 'cli-agent',
    provider: 'anthropic',
    command: 'claude',
    homepage: 'https://claude.com/claude-code',
    steps: SHARED_TERMINAL_STEPS,
    strengths: [
      '長い context を扱った大規模リファクタが得意',
      'CLAUDE.md / sub-agent / hook で「全部任せる」運用ができる',
      'ターミナル常駐で複数ファイルを一度に編集できる',
      'コードの意図を読みながらレビュー / 修正する力が高い',
    ],
    weaknesses: [
      'CLI 操作と Node.js 環境が前提で初学者には敷居がある',
      '画面の見た目（UI デザイン）の生成は専門ツールに劣る',
    ],
    cost: {
      tier: 'paid-mid',
      notes: 'Claude Pro / Max サブスク or API 従量課金（月 $20〜）',
    },
    nonEngineerFriendliness: 2,
    primaryUseCases: [
      'feature-implementation',
      'codebase-refactor',
      'long-context-refactor',
      'pair-programming',
      'code-review',
    ],
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    description: 'ターミナルで Codex CLI を起動して、AI にコードを書いてもらいましょう',
    kind: 'terminal',
    category: 'cli-agent',
    provider: 'openai',
    command: 'codex',
    homepage: 'https://github.com/openai/codex',
    steps: SHARED_TERMINAL_STEPS,
    strengths: [
      'OSS で透明性が高く、自分で挙動を追える',
      'OpenAI モデルを Claude Code 風 workflow で扱える',
      'sandbox / approval mode が細かく、安全に試せる',
    ],
    weaknesses: [
      'CLI と Node 環境が前提で初学者には敷居がある',
      'Claude Code に比べると agent 機能が成熟途中',
    ],
    cost: {
      tier: 'usage-based',
      notes: 'OpenAI API 従量課金（GPT-5 系モデル想定、$5〜）',
    },
    nonEngineerFriendliness: 2,
    primaryUseCases: [
      'feature-implementation',
      'one-shot-task',
      'codebase-refactor',
      'pair-programming',
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    description: 'Cursor（デスクトップエディタ）を開いて、AI とコードを書きましょう',
    kind: 'desktop',
    category: 'ide-agent',
    provider: 'cursor',
    homepage: 'https://cursor.com',
    steps: [
      'Cursor アプリを起動する',
      '「Open Folder」からプロジェクトフォルダを選択',
      'チャット欄に作りたいものを入力して Enter',
    ],
    strengths: [
      'VS Code ベースで GUI 操作のまま AI を使える',
      'チャット / Composer / Tab 補完が一体化していて学習コストが低い',
      'コードの差分提案を視覚的にレビューできる',
    ],
    weaknesses: [
      'デスクトップアプリのインストールと多少の慣れが必要',
      '完全な「全部任せる」自律 agent としては Claude Code に劣る',
    ],
    cost: {
      tier: 'paid-mid',
      notes: 'Free プランあり、Pro は月 $20',
    },
    nonEngineerFriendliness: 3,
    primaryUseCases: [
      'pair-programming',
      'feature-implementation',
      'codebase-refactor',
      'code-review',
    ],
  },
  {
    id: 'v0',
    label: 'v0',
    description: 'Vercel の v0 を開いて、ブラウザで UI を生成しましょう',
    kind: 'web',
    category: 'browser-builder',
    provider: 'vercel',
    homepage: 'https://v0.dev',
    steps: [
      'ブラウザで v0.dev を開く',
      'プロンプト欄に作りたい画面を日本語で入力',
      '生成結果を確認し、必要なら修正を依頼する',
    ],
    strengths: [
      'プロンプト 1 本で React + Tailwind の UI が即座に生成される',
      'shadcn/ui ベースで Vercel デプロイまで地続きで運べる',
      'インストール不要で、ブラウザだけで完結する',
    ],
    weaknesses: [
      'バックエンドや業務ロジックの実装には弱い',
      '生成結果は良い「叩き台」で、本番品質には別ツールでの仕上げが要る',
    ],
    cost: {
      tier: 'paid-low',
      notes: 'Free プランあり、Premium は月 $20',
    },
    nonEngineerFriendliness: 5,
    primaryUseCases: ['scaffold-ui', 'one-shot-task'],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    description: 'ChatGPT のブラウザ版を開いて、AI に質問や生成を依頼しましょう',
    kind: 'web',
    category: 'workspace',
    provider: 'openai',
    homepage: 'https://chat.openai.com',
    steps: [
      'ブラウザで chat.openai.com を開く',
      '新しいチャットを開始する',
      '作りたいものを日本語で入力して送信',
    ],
    strengths: [
      'インストール不要、誰でもすぐ使える定番の入口',
      '文章 / 要約 / 翻訳 / リサーチなど守備範囲が広い',
      'Code Interpreter / 画像生成 / Voice などツールが豊富',
    ],
    weaknesses: [
      'ローカルファイルやリポ全体を扱う設計ではない',
      'コード一発生成のあとに「IDE に貼って動かす」段が必要',
    ],
    cost: {
      tier: 'paid-mid',
      notes: 'Free プランあり、Plus は月 $20、Team / Enterprise は別枠',
    },
    nonEngineerFriendliness: 5,
    primaryUseCases: [
      'document-writing',
      'research',
      'one-shot-task',
      'data-analysis',
    ],
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    description: 'ターミナルで Gemini CLI を起動して、AI にコードを書いてもらいましょう',
    kind: 'terminal',
    category: 'cli-agent',
    provider: 'google',
    command: 'gemini',
    homepage: 'https://github.com/google-gemini/gemini-cli',
    steps: SHARED_TERMINAL_STEPS,
    strengths: [
      'Google Gemini モデルをターミナルから直接扱える',
      'OSS で挙動を追える、無料枠が比較的大きい',
      '長い context（数百万トークン）を扱えるモデルがある',
    ],
    weaknesses: [
      'CLI と Node 環境が前提で初学者には敷居がある',
      'agent / sub-agent エコシステムは Claude Code に劣る',
    ],
    cost: {
      tier: 'free',
      notes: 'Google AI Studio API キー（無料枠あり）。有料プランは usage-based',
    },
    nonEngineerFriendliness: 2,
    primaryUseCases: [
      'feature-implementation',
      'one-shot-task',
      'long-context-refactor',
    ],
  },
  // ── New entries (TQ-219) ────────────────────────────────────────────────
  {
    id: 'bolt',
    label: 'Bolt',
    description:
      'Bolt.new をブラウザで開いて、プロンプトから動くアプリをまるごと生成しましょう',
    kind: 'web',
    category: 'browser-builder',
    provider: 'stackblitz',
    homepage: 'https://bolt.new',
    steps: [
      'ブラウザで bolt.new を開く',
      '作りたいアプリを日本語で入力して送信',
      'ブラウザ内のプレビューを確認し、必要なら追加で修正を依頼',
      '気に入ったら GitHub に push し、Vercel などにデプロイする',
    ],
    strengths: [
      'プロンプト 1 本で動くフルスタックアプリ（フロント + バック）が立ち上がる',
      'StackBlitz の WebContainer 上でブラウザだけで完結する',
      'GitHub に直接 push できてそのままデプロイに繋げやすい',
    ],
    weaknesses: [
      '生成物の品質はばらつきがあり、複雑な要件は人手で修正が要る',
      '長期運用するアプリの保守は別ツールに引き継ぐのが現実的',
    ],
    cost: {
      tier: 'paid-low',
      notes: 'Free プランあり、Pro は月 $20 から（トークン量で変動）',
    },
    nonEngineerFriendliness: 5,
    primaryUseCases: ['scaffold-app', 'scaffold-ui', 'one-shot-task'],
  },
  {
    id: 'lovable',
    label: 'Lovable',
    description:
      'Lovable.dev をブラウザで開いて、チャットだけで Web アプリを作りましょう',
    kind: 'web',
    category: 'browser-builder',
    provider: 'lovable',
    homepage: 'https://lovable.dev',
    steps: [
      'ブラウザで lovable.dev を開く',
      '作りたいアプリを日本語で入力して送信',
      'プレビューを確認しながら、追加で修正をチャットで依頼',
      '完成したら GitHub 連携 / Supabase 連携でデータ層まで繋ぐ',
    ],
    strengths: [
      'チャットだけで Web アプリが組み上がる、超非エンジニア向け',
      'Supabase / GitHub 連携が標準で、データ層やバージョン管理に繋ぎやすい',
      'デザインの完成度が高く、プロダクト風の見た目になる',
    ],
    weaknesses: [
      '細部のロジック調整は AI 任せだと当たり外れが出る',
      'チームでの大規模開発には CLI / IDE 系への引き継ぎが要る',
    ],
    cost: {
      tier: 'paid-mid',
      notes: 'Free プランあり、Pro は月 $25 から（メッセージ数で変動）',
    },
    nonEngineerFriendliness: 5,
    primaryUseCases: ['scaffold-app', 'scaffold-ui', 'feature-implementation'],
  },
  {
    id: 'devin',
    label: 'Devin',
    description:
      'Cognition の Devin を開いて、自律 AI に開発タスクを丸ごと任せましょう',
    kind: 'web',
    category: 'autonomous',
    provider: 'cognition',
    homepage: 'https://devin.ai',
    steps: [
      'ブラウザで devin.ai を開いて新規セッションを作成',
      '依頼したいタスクを日本語で書く（GitHub repo を渡す）',
      '進捗を Devin の作業ログで追い、必要に応じて指示を足す',
      '完了したら PR をレビュー / マージする',
    ],
    strengths: [
      '長時間自律で動き続け、PR まで作る agent 型 AI',
      'GitHub / Slack / Linear などと連携してタスクを引き受けられる',
      '「丸投げ」型の依頼に向いている',
    ],
    weaknesses: [
      '料金が高く、個人ユースのコスパは厳しい',
      '自律実行ゆえに方向性を逸れたまま走るリスクがあり、監督が要る',
    ],
    cost: {
      tier: 'paid-high',
      notes: 'Team プランは月 $500 〜（ACU 従量課金）',
    },
    nonEngineerFriendliness: 4,
    primaryUseCases: [
      'autonomous-task',
      'feature-implementation',
      'codebase-refactor',
    ],
  },
  {
    id: 'replit-agent',
    label: 'Replit Agent',
    description:
      'Replit を開いて、Replit Agent にアプリの設計と実装を依頼しましょう',
    kind: 'web',
    category: 'autonomous',
    provider: 'replit',
    homepage: 'https://replit.com/agent',
    steps: [
      'ブラウザで replit.com を開いてサインイン',
      '「Create with AI」/ Agent を選び、作りたいアプリを日本語で説明',
      'Agent が組み立てる進捗を見ながら、追加要望を伝える',
      '完成したら Replit からそのままデプロイする',
    ],
    strengths: [
      'ブラウザだけで「設計 → 実装 → デプロイ」が一気通貫で完了する',
      'クラウド開発環境込みで、ローカル設定が完全に不要',
      '失敗してもサンドボックス内なので環境破壊のリスクが低い',
    ],
    weaknesses: [
      '生成物のコード品質は一旦動くレベル止まりのことがある',
      '長期運用に向けては別環境（GitHub / 専用 VPS）に移す判断が要る',
    ],
    cost: {
      tier: 'paid-low',
      notes: 'Core プランは月 $20、Agent 利用は usage-based の checkpoint 課金',
    },
    nonEngineerFriendliness: 5,
    primaryUseCases: [
      'scaffold-app',
      'autonomous-task',
      'deploy',
      'feature-implementation',
    ],
  },
  {
    id: 'claude-projects',
    label: 'Claude Projects',
    description:
      'claude.ai の Projects を作って、長文コンテキストごと AI に相談しましょう',
    kind: 'web',
    category: 'workspace',
    provider: 'anthropic',
    homepage: 'https://claude.ai',
    steps: [
      'ブラウザで claude.ai にサインインする',
      '左メニューから「Projects」を開いて新規プロジェクトを作成',
      '関連ファイル / 仕様 / 過去の議事録を Project Knowledge にアップロード',
      'プロジェクト内チャットで作業を進める（context が常に共有される）',
    ],
    strengths: [
      '長文コンテキストを Project ごとに保存できて、毎回貼り直さなくて良い',
      'カスタム指示で「このプロジェクトの口調・前提」を固定できる',
      'チームで共有して同じ context を使い回せる（Team プラン以上）',
    ],
    weaknesses: [
      'コードを直接実行する agent ではない（read / 提案までが基本）',
      'Knowledge の更新は手動なので、最新コードと自動同期はしない',
    ],
    cost: {
      tier: 'paid-mid',
      notes: 'Claude Pro 月 $20 から、Team / Enterprise は別枠',
    },
    nonEngineerFriendliness: 5,
    primaryUseCases: [
      'document-writing',
      'research',
      'long-context-refactor',
      'code-review',
    ],
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    description:
      'Codeium の Windsurf エディタを起動して、AI と協力してコードを書きましょう',
    kind: 'desktop',
    category: 'ide-agent',
    provider: 'codeium',
    homepage: 'https://windsurf.com',
    steps: [
      'Windsurf アプリをダウンロードして起動',
      '「Open Folder」からプロジェクトフォルダを選択',
      'Cascade パネル（AI チャット）に作りたいものを入力',
      '提案された差分をレビューしてプロジェクトに適用',
    ],
    strengths: [
      'VS Code 互換で AI Cascade が深く統合されている',
      'コードベース全体を把握して agent 的に編集できる',
      'Cursor の代替として無料枠が比較的厚い',
    ],
    weaknesses: [
      'デスクトップアプリのインストールと多少の慣れが必要',
      '完全な「全部任せる」自律 agent としては Devin / Claude Code に劣る',
    ],
    cost: {
      tier: 'paid-low',
      notes: 'Free プランあり、Pro は月 $15 から',
    },
    nonEngineerFriendliness: 3,
    primaryUseCases: [
      'pair-programming',
      'feature-implementation',
      'codebase-refactor',
      'code-review',
    ],
  },
  // ── Catch-all ───────────────────────────────────────────────────────────
  {
    id: 'other',
    label: 'その他',
    description:
      'お気に入りの AI ツールがあれば、それを開いて同じ手順で作業を進めましょう',
    kind: 'freeform',
    category: 'freeform',
    provider: 'other',
    steps: [
      'お使いの AI ツールを開く',
      'プロジェクトのコンテキスト（目的・現在地）を共有する',
      '次の一手を依頼して、結果を確認する',
    ],
    strengths: ['学習者の手に馴染んでいるツールを尊重できる'],
    weaknesses: ['カタログ外なので Planner / Mentor が個別最適化を出せない'],
    cost: {
      tier: 'free',
      notes: '使用ツール次第',
    },
    nonEngineerFriendliness: 3,
    primaryUseCases: ['one-shot-task'],
  },
] as const

const CATALOG_BY_ID = new Map<string, AiToolCatalogEntry>(
  AI_TOOLS_CATALOG.map((entry) => [entry.id, entry]),
)

/** Lookup a catalog entry by its stable id. Returns `undefined` for unknown ids. */
export function getAiToolById(id: string): AiToolCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id)
}

/** Type guard: is the given string a known catalog id? */
export function isKnownAiToolId(id: string): boolean {
  return CATALOG_BY_ID.has(id)
}

/**
 * Map a list of ids to catalog entries, preserving input order and
 * dropping unknown ids silently. The input order is deterministic:
 * callers use it to render "primary" (first) + "secondary" (rest).
 */
export function resolveAiTools(ids: readonly string[]): AiToolCatalogEntry[] {
  const seen = new Set<string>()
  const resolved: AiToolCatalogEntry[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const entry = CATALOG_BY_ID.get(id)
    if (entry) resolved.push(entry)
  }
  return resolved
}

/** Light-weight option shape used by the intake wizard checkbox list. */
export interface AiToolOption {
  value: string
  label: string
}

export const AI_TOOL_OPTIONS: readonly AiToolOption[] = AI_TOOLS_CATALOG.map(
  (entry) => ({ value: entry.id, label: entry.label }),
)

/**
 * Filter catalog entries by a primary use case — used by Plan compiler /
 * Mentor to suggest "for this step, try X" matches.
 */
export function findToolsByUseCase(
  useCase: AiToolUseCase,
): AiToolCatalogEntry[] {
  return AI_TOOLS_CATALOG.filter((entry) =>
    entry.primaryUseCases.includes(useCase),
  )
}

/**
 * Filter catalog entries by category — used to surface "all browser builders"
 * etc. when the learner asks for a comparison.
 */
export function findToolsByCategory(
  category: AiToolCategory,
): AiToolCatalogEntry[] {
  return AI_TOOLS_CATALOG.filter((entry) => entry.category === category)
}
