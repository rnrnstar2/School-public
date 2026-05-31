import { THREE_AXIS_GUIDE } from './three-axis-guide'

export type ClassicAiDelegationKind = 'prompt' | 'code_brief' | 'analyze'
export type AiDelegationKind = ClassicAiDelegationKind

export interface AiDelegationPromptContext {
  goalTitle: string
  goalDescription: string | null
  nodeLabel: string
  nodeType: string
  nodeStatus: string
  ownerType: string
  dependencyLabels: readonly string[]
  siblingLabels: readonly string[]
  nextActionPreview: string | null
  contextSnippets: ReadonlyArray<{
    sourceType: string
    content: string
  }>
}

const KIND_LABELS: Record<ClassicAiDelegationKind, string> = {
  prompt: 'Initial Prompt',
  code_brief: 'Code Brief',
  analyze: 'Analyze Brief',
}

function listOrFallback(values: readonly string[], fallback: string) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : fallback
}

function contextBlock(snippets: AiDelegationPromptContext['contextSnippets']) {
  if (snippets.length === 0) {
    return '追加 context はありません。'
  }

  return snippets
    .map((snippet) => `- [${snippet.sourceType}] ${snippet.content}`)
    .join('\n')
}

export function formatAiDelegationKindLabel(kind: AiDelegationKind) {
  return KIND_LABELS[kind]
}

export function buildAiDelegationPromptMessages(
  kind: ClassicAiDelegationKind,
  context: AiDelegationPromptContext,
) {
  const systemByKind: Record<ClassicAiDelegationKind, string> = {
    prompt: [
      THREE_AXIS_GUIDE,
      '',
      'あなたは学習者の task を別の AI に委譲するブリーフ作成アシスタントです。',
      '学習者がそのまま Codex CLI / Claude Code / ChatGPT に貼れる prompt を作ってください。',
      '出力は日本語、平文のみ。コードフェンスは禁止です。',
      '目的、前提、制約、完了条件を明確にし、曖昧さを減らしてください。',
    ].join('\n'),
    code_brief: [
      THREE_AXIS_GUIDE,
      '',
      'あなたは Next.js / Supabase 学習タスク向けの実装ブリーフ作成アシスタントです。',
      '構成案、作業順、確認ポイント、成果物を短く具体的に整理してください。',
      '出力は日本語、平文のみ。箇条書きは可、コードフェンスは禁止です。',
    ].join('\n'),
    analyze: [
      THREE_AXIS_GUIDE,
      '',
      'あなたは学習タスクの詰まり原因を切り分ける分析アシスタントです。',
      '仮説を3本まで提示し、各仮説ごとに確認方法と次アクションを添えてください。',
      '出力は日本語、平文のみ。コードフェンスは禁止です。',
    ].join('\n'),
  }

  const user = [
    `delegate kind: ${kind} (${formatAiDelegationKindLabel(kind)})`,
    '',
    `Goal: ${context.goalTitle}`,
    `Goal description: ${context.goalDescription ?? 'なし'}`,
    `Task: ${context.nodeLabel}`,
    `Node type: ${context.nodeType}`,
    `Node status: ${context.nodeStatus}`,
    `Owner type: ${context.ownerType}`,
    `Next action preview: ${context.nextActionPreview ?? 'なし'}`,
    '',
    'Dependencies:',
    listOrFallback(context.dependencyLabels, '- 依存関係なし'),
    '',
    'Sibling tasks:',
    listOrFallback(context.siblingLabels, '- 兄弟 task なし'),
    '',
    'Recent context:',
    contextBlock(context.contextSnippets),
    '',
    'この task を別の AI に委譲するための brief を返してください。',
  ].join('\n')

  return {
    system: systemByKind[kind],
    user,
  }
}

export function buildMockAiDelegationBrief(
  kind: ClassicAiDelegationKind,
  context: AiDelegationPromptContext,
) {
  const dependencyLine = context.dependencyLabels.length > 0
    ? context.dependencyLabels.join(' / ')
    : '依存関係なし'
  const siblingLine = context.siblingLabels.length > 0
    ? context.siblingLabels.join(' / ')
    : '兄弟 task なし'

  switch (kind) {
    case 'prompt':
      return [
        `[Mock ${formatAiDelegationKindLabel(kind)}] ${context.nodeLabel}`,
        'あなたは学習者の task を代行する AI です。',
        `目的: ${context.goalTitle} を進めるために「${context.nodeLabel}」を前に進める。`,
        `前提: status=${context.nodeStatus}, owner=${context.ownerType}, depends_on=${dependencyLine}.`,
        `周辺 task: ${siblingLine}.`,
        '依頼: 必要な確認事項を先に洗い出し、最小ステップで実装または調査を進めてください。',
        '完了条件: 進め方、成果物、確認観点が 1 つの brief にまとまっていること。',
      ].join('\n')
    case 'code_brief':
      return [
        `[Mock ${formatAiDelegationKindLabel(kind)}] ${context.nodeLabel}`,
        `対象 task: ${context.nodeLabel}`,
        `ゴール: ${context.goalTitle}`,
        '実装方針:',
        '- 既存 goal tree / context panel と整合する UI・API を優先する。',
        '- 変更箇所、確認方法、想定レスポンスを brief に含める。',
        `確認ポイント: depends_on=${dependencyLine}, next_action=${context.nextActionPreview ?? 'なし'}.`,
      ].join('\n')
    case 'analyze':
      return [
        `[Mock ${formatAiDelegationKindLabel(kind)}] ${context.nodeLabel}`,
        '仮説 1: 依存 task の未消化が原因。確認: depends_on の完了状態を確認する。',
        '仮説 2: context 不足で実装開始条件が曖昧。確認: goal_contexts の最新 source を読む。',
        '仮説 3: 完了条件が不明瞭。確認: next_action_preview と goal の description を見直す。',
        '次アクション: 上の確認で不足が見つかったら brief を更新し、goal context に記録する。',
      ].join('\n')
  }
}
