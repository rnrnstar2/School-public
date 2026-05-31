import type { PlannerHearingAnswers, PlannerHearingInsights } from '@/lib/planner/types'

/* ---------- public types ---------- */

export type FirstStepType = 'tool-selection' | 'lesson' | 'setup'

/**
 * Persona category passed in from upstream (planner / hearing). Used to gate
 * CLI tool selection so that only engineer-flavored personas see the 4-way
 * CLI menu (TQ-216).
 *
 * - 'engineer' : P-ENG-* 系 (Web エンジニア / プロトタイパー等) → CLI 4 択を提示
 * - 'non-engineer' : P-NONENG-* 系 (vibe coding ツール前提層) → no-code 系を提示
 * - 'unknown' : persona 未確定の旧フロー → 従来どおり CLI 4 択にフォールバック
 */
export type PersonaCategory = 'engineer' | 'non-engineer' | 'unknown'

export interface ToolOption {
  id: string
  name: string
  description: string
  suitableFor: string
  notSuitableFor: string
}

export interface FirstStep {
  type: FirstStepType
  title: string
  description: string
  /** Tool options when type === 'tool-selection' */
  options?: ToolOption[]
  /** Direct lesson to start when type === 'lesson' */
  lessonId?: string
}

/* ---------- tool option definitions ---------- */

/**
 * No-code first option set for P-NONENG-* personas (TQ-216 placeholder).
 * 本格的な atom / metadata は TQ-218 (atom.common.no-code-first.*) と
 * TQ-219 (ai-tools-catalog.ts 機械可読化) で埋める想定。ここでは少なくとも
 * 「CLI 4 択を踏ませない」ことだけ保証する placeholder セットを返す。
 */
const NO_CODE_TOOL_OPTIONS: ToolOption[] = [
  {
    id: 'v0',
    name: 'v0 by Vercel',
    description: 'ブラウザだけで AI に依頼して、画面を即生成できる Web ツール。AI に「こういう画面が欲しい」と話すだけで、最初の画面が出ます。',
    suitableFor: 'CLI を触らずに、ブラウザだけで「画面が出る」体験を最短で得たい方',
    notSuitableFor: '最初からローカル開発 / git 運用に慣れたい方',
  },
  {
    id: 'bolt',
    name: 'Bolt.new',
    description: 'ブラウザで動く full-stack 向けの AI コーディング環境。AI にプロンプトを投げると、画面 + バックエンドの雛形まで作ってくれます。',
    suitableFor: '簡単な Web アプリ（フォーム / 一覧 / 投稿）を AI に丸ごと作ってほしい方',
    notSuitableFor: '既存コードベースに対して細かい修正を入れたい方',
  },
  {
    id: 'lovable',
    name: 'Lovable',
    description: 'プロンプトで Web アプリを 1 ショット生成できる no-code 寄りの AI ツール。',
    suitableFor: 'AI に丸ごと任せて、まずは「動くもの」が欲しい方',
    notSuitableFor: 'コードを自分で書きながら覚えたい方',
  },
  {
    id: 'gui-assistant',
    name: 'デスクトップアプリ (Cursor / Windsurf 等)',
    description: 'エディタに統合された AI アシスタント。CLI を意識しなくても、画面操作中心で AI に依頼できます。',
    suitableFor: 'いずれはローカル環境にも触りたいが、まずは画面中心で進めたい方',
    notSuitableFor: 'ブラウザだけで完結させたい方',
  },
]

const CLI_TOOL_OPTIONS: ToolOption[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic製のAIコーディングツール。AIにまとめて指示しながら、要件整理から実装・修正まで一気通貫で進められます。',
    suitableFor: '一つの文脈で継続的に作業したい方、AIにまとめて相談したい方',
    notSuitableFor: 'まずはブラウザだけで軽く試したい方',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    description: 'OpenAI製のAIコーディングツール。AIに短い単位で依頼しやすく、一つずつ確認しながら前に進めやすいワークフローです。',
    suitableFor: '一つずつ確認しながら進めたい方、依頼を小さく区切りたい方',
    notSuitableFor: '長い実装文脈をまたいで作業したい方',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Google製のAIコーディングツール。AIに指示しながら進められ、Googleエコシステムとの連携に強みがあります。',
    suitableFor: 'Google系サービスをよく使う方、別の選択肢を試したい方',
    notSuitableFor: 'Google系サービスを使わない方',
  },
  {
    id: 'gui-assistant',
    name: 'デスクトップアプリ (Cursor / Windsurf等)',
    description: 'エディタに統合されたAIアシスタント。画面上で操作でき、ブラウザやエディタ中心でAI活用を始められます。',
    suitableFor: 'CLIが苦手な方、画面上で完結させたい方',
    notSuitableFor: 'ローカルのコード編集から確認までまとめて高速に回したい方',
  },
]

/* ---------- helpers ---------- */

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function canUseLocalTools(hearing: Partial<PlannerHearingAnswers>): boolean {
  const os = normalize(hearing.operatingSystem)
  const localWork = normalize(hearing.localWorkCapability)
  return (
    /(mac|windows|linux|ubuntu)/.test(os) &&
    !/(できない|難しい|厳しい|スマホだけ|タブレットだけ|制限)/.test(localWork)
  )
}

function needsToolSelection(hearing: Partial<PlannerHearingAnswers>): boolean {
  const aiTools = normalize(hearing.aiTools)
  // User already has a specific tool → skip selection
  if (/(claude code|codex|cursor|windsurf|copilot)/.test(aiTools)) {
    return false
  }
  return canUseLocalTools(hearing)
}

function prefersStudyFirstStart(text: string): boolean {
  return /(基礎から|入門から|文法|教材|講座|体系的|独学)/.test(text)
}

/* ---------- main logic ---------- */

/**
 * Picks the tool option set for the given persona category.
 * - engineer / unknown → CLI 4 択（既存挙動）
 * - non-engineer → no-code 系 4 択（v0 / Bolt / Lovable / GUI assistant）
 */
function pickToolOptions(persona: PersonaCategory): ToolOption[] {
  return persona === 'non-engineer' ? NO_CODE_TOOL_OPTIONS : CLI_TOOL_OPTIONS
}

/**
 * Tool selection 提示メッセージを persona に応じて軽く出し分ける。
 */
function buildToolSelectionDescription(
  persona: PersonaCategory,
  studyFirstStart: boolean,
): string {
  if (persona === 'non-engineer') {
    return studyFirstStart
      ? '最初は座学からではなく、ブラウザだけで AI に依頼して「画面が出る」体験を作るのが最短です。下のツールから 1 つ選んでください。'
      : 'AI にお任せで Web アプリを作るために、まずはブラウザで使える AI ツールを 1 つ選んでください。'
  }
  return studyFirstStart
    ? '最初は座学からではなく、あなたの環境に合うAIツールを1つ決めて、そのツールに依頼しながら制作を始めるのが最短です。'
    : 'あなたの環境と目的に合ったツールを選択すると、ブラウザ中心またはAI駆動で始める最適なレッスンに進めます。'
}

/**
 * Determines the optimal first step after hearing completes.
 * Returns a concrete, actionable step — never an abstract "planning" step.
 *
 * @param hearing  ヒアリング回答（既存挙動の主入力）
 * @param insights ヒアリング派生 insights（未使用だが将来拡張のため保持）
 * @param persona  persona カテゴリ。P-ENG-* なら 'engineer'、P-NONENG-* なら
 *                 'non-engineer'。未指定 / 不明時は 'unknown' として扱い、
 *                 旧来の CLI 4 択挙動にフォールバックする (TQ-216)。
 */
export function determineFirstStep(
  hearing: Partial<PlannerHearingAnswers>,
  insights?: PlannerHearingInsights | null,
  persona: PersonaCategory = 'unknown',
): FirstStep {
  const experience = normalize(hearing.experience)
  const materials = normalize(hearing.existingMaterials)
  const cli = normalize(hearing.cliFamiliarity)
  const localWork = normalize(hearing.localWorkCapability)
  const purpose = normalize(hearing.purpose)
  const studyFirstStart = prefersStudyFirstStart(`${experience} ${purpose}`)

  // Case 1: Cannot use local tools → online-first lesson
  if (!canUseLocalTools(hearing)) {
    return {
      type: 'lesson',
      title: 'ブラウザからAI活用を始める',
      description: 'ローカル環境なしでも始められる方法を紹介します。まずはブラウザで動くAIツールから始めて、AIに依頼しながら制作を進めましょう。',
      lessonId: 'lesson_web_builder_041_ai_coding_tool_overview',
    }
  }

  // Case 2: Already has code/repo → jump to practical task
  // 非エンジニアペルソナはここに該当しない想定だが、念のため engineer 扱いの時のみ
  // setup 分岐に進める（非エンジニアにいきなり既存リポへの接続を勧めない）。
  if (
    persona !== 'non-engineer' &&
    /(next|react|repo|リポジトリ|github|実装中|途中|すでに作って|既に作って|公開済み|コードがある)/.test(
      `${experience} ${materials}`,
    )
  ) {
    return {
      type: 'setup',
      title: 'AIツールをプロジェクトに接続する',
      description: '既存のコードがあるので、手で書き始める前にAIコーディングツールを接続し、次の実装依頼から進めましょう。',
      lessonId: 'lesson_web_builder_046_first_project_and_basic_ai_requests',
    }
  }

  // Case 3: Needs tool selection (always prefer picking an AI tool over study-first starts)
  if (needsToolSelection(hearing) || persona === 'non-engineer') {
    return {
      type: 'tool-selection',
      title: '最初に使うAIツールを選んでください',
      description: buildToolSelectionDescription(persona, studyFirstStart),
      options: pickToolOptions(persona),
    }
  }

  // Case 4: Has a specific tool already mentioned → go to install lesson
  const aiTools = normalize(hearing.aiTools)
  if (/claude code|claude/.test(aiTools)) {
    return {
      type: 'lesson',
      title: 'Claude Code をインストールする',
      description: 'Claude Code の導入を完了して、最初のプロジェクトに取りかかりましょう。',
      lessonId: 'lesson_web_builder_044_install_claude_code_and_verify',
    }
  }
  if (/codex/.test(aiTools)) {
    return {
      type: 'lesson',
      title: 'Codex CLI をインストールする',
      description: 'Codex CLI の導入を完了して、最初のプロジェクトに取りかかりましょう。',
      lessonId: 'lesson_web_builder_045_install_codex_cli_and_verify',
    }
  }
  if (/(cursor|windsurf|copilot)/.test(aiTools)) {
    return {
      type: 'lesson',
      title: 'デスクトップAIツールでプロジェクトを始める',
      description: '選択したツールの基本操作を学び、最初のプロジェクトに取りかかりましょう。',
      lessonId: 'lesson_web_builder_042_choose_ai_tool_by_goal_os_cli',
    }
  }

  // Default: tool selection
  return {
    type: 'tool-selection',
    title: '最初に使うAIツールを選んでください',
    description: buildToolSelectionDescription(persona, studyFirstStart),
    options: pickToolOptions(persona),
  }
}

/**
 * Given a selected tool ID from tool-selection, returns the lesson ID to start.
 *
 * 非エンジニア向け no-code 系 (v0 / bolt / lovable) の本格 atom は TQ-218 で
 * 整備予定のため、現時点では web-builder anchor の汎用 overview lesson に
 * フォールバックさせる placeholder。
 */
export function resolveToolSelectionLesson(toolId: string): string {
  switch (toolId) {
    case 'claude-code':
      return 'lesson_web_builder_044_install_claude_code_and_verify'
    case 'codex':
      return 'lesson_web_builder_045_install_codex_cli_and_verify'
    case 'gemini-cli':
      return 'lesson_web_builder_041_ai_coding_tool_overview'
    case 'gui-assistant':
      return 'lesson_web_builder_042_choose_ai_tool_by_goal_os_cli'
    // No-code first picks (TQ-216 placeholder; replace with TQ-218 atoms once landed).
    case 'v0':
    case 'bolt':
    case 'lovable':
      return 'lesson_web_builder_041_ai_coding_tool_overview'
    default:
      return 'lesson_web_builder_042_choose_ai_tool_by_goal_os_cli'
  }
}
