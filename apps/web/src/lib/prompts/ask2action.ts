import type { NextQuestionOutput } from '@/lib/api/schemas'

import { THREE_AXIS_GUIDE } from './three-axis-guide'

export interface Ask2ActionPromptNode {
  label: string
  status: string
  ownerType: string
  nodeType: string
}

export interface Ask2ActionPromptLearnerState {
  targetOutcome?: string | null
  skillLevel?: string | null
  blockers?: string[] | null
}

export interface Ask2ActionPromptMemory {
  title: string
  bullets?: string[] | null
}

export interface Ask2ActionPromptContextSnippet {
  sourceType: string
  content: string
}

export interface BuildAsk2ActionPromptInput {
  goalTitle: string
  goalDescription?: string | null
  nodes: Ask2ActionPromptNode[]
  learnerState?: Ask2ActionPromptLearnerState | null
  mentorMemories?: Ask2ActionPromptMemory[]
  contextSnippets?: Ask2ActionPromptContextSnippet[]
  lastAnswer?: string | null
}

const MAX_SNIPPET_LENGTH = 120

function normalizeLine(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function truncate(value: string, maxLength = MAX_SNIPPET_LENGTH) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function formatNodes(nodes: Ask2ActionPromptNode[]) {
  if (nodes.length === 0) {
    return '  - goal tree はまだありません'
  }

  return nodes
    .slice(0, 8)
    .map((node) => `  - [${node.status}] ${node.label} (${node.nodeType} / owner=${node.ownerType})`)
    .join('\n')
}

function formatMemories(memories: Ask2ActionPromptMemory[]) {
  if (memories.length === 0) {
    return '  - mentor memory なし'
  }

  return memories
    .slice(0, 4)
    .map((memory) => {
      const bullets = (memory.bullets ?? [])
        .map((bullet) => normalizeLine(bullet))
        .filter((bullet) => bullet.length > 0)
      const head = truncate(normalizeLine(memory.title), 50)
      if (bullets.length === 0) {
        return `  - ${head}`
      }

      return `  - ${head}: ${truncate(bullets.join(' / '), 80)}`
    })
    .join('\n')
}

function formatContextSnippets(snippets: Ask2ActionPromptContextSnippet[]) {
  if (snippets.length === 0) {
    return '  - goal context なし'
  }

  return snippets
    .slice(0, 4)
    .map((snippet) => {
      const content = truncate(normalizeLine(snippet.content))
      return `  - [${snippet.sourceType}] ${content}`
    })
    .join('\n')
}

export function buildFallbackNextQuestion(lastAnswer?: string | null): NextQuestionOutput {
  const normalizedAnswer = normalizeLine(lastAnswer)
  if (normalizedAnswer.length > 0) {
    return {
      question: 'その答えを踏まえて、次にどこを整理したいですか？',
      choices: ['優先順位を決めたい', '次の手順を知りたい', 'ツール選びを固めたい', '自由入力'],
      freeform_hint: '一言でも大丈夫です。今の答えの続きで、次に整理したいことを書いてください。',
    }
  }

  return {
    question: '今、何に迷っていますか？',
    choices: ['目的がぼやけている', '手順が不明', 'ツール選択', '自由入力'],
    freeform_hint: '選択肢にない場合は、今止まっている理由をそのまま書いてください。',
  }
}

export function buildAsk2ActionPromptMessages(
  input: BuildAsk2ActionPromptInput,
) {
  const blockers = (input.learnerState?.blockers ?? [])
    .map((blocker) => normalizeLine(blocker))
    .filter((blocker) => blocker.length > 0)

  return {
    system: [
      THREE_AXIS_GUIDE,
      '',
      'あなたは School の Ask2Action アシスタントです。',
      '学習者が次の一歩を決めやすくなるように、短く具体的な「次の問い」を 1 つだけ作成してください。',
      '',
      '# 目的',
      '- 学習者の迷いを1段階だけ減らす問いにする。',
      '- 抽象的な励ましや説明ではなく、回答しやすい選択肢を出す。',
      '- 問いは日本語 1 文、choices は 2〜4 個。',
      '- choices は短く、互いに重ならない言い方にする。',
      '- freeform_hint は自由入力したくなる具体例を 1 文で示す。',
      '',
      '# 禁止',
      '- 複数の問いを出さない。',
      '- 長い前置き、Markdown、コードフェンスを出さない。',
      '- choices を 5 個以上にしない。',
      '',
      '# 出力形式',
      '- JSON オブジェクトのみを返す。',
      '- キーは `question`, `choices`, `freeform_hint` のみ。',
      '- 例: {"question":"今どこが一番止まっていますか？","choices":["優先順位","設計","実装"],"freeform_hint":"選択肢にない場合は、今の迷いを1文で書いてください。"}',
    ].join('\n'),
    user: [
      `Goal: ${normalizeLine(input.goalTitle)}`,
      input.goalDescription ? `Goal description: ${truncate(normalizeLine(input.goalDescription), 180)}` : null,
      input.learnerState?.targetOutcome
        ? `Learner target outcome: ${truncate(normalizeLine(input.learnerState.targetOutcome), 180)}`
        : null,
      input.learnerState?.skillLevel ? `Skill level: ${normalizeLine(input.learnerState.skillLevel)}` : null,
      blockers.length > 0 ? `Blockers: ${blockers.join(', ')}` : null,
      input.lastAnswer ? `Last answer: ${truncate(normalizeLine(input.lastAnswer), 180)}` : null,
      '',
      'Goal nodes:',
      formatNodes(input.nodes),
      '',
      'Mentor memories:',
      formatMemories(input.mentorMemories ?? []),
      '',
      'Recent goal context:',
      formatContextSnippets(input.contextSnippets ?? []),
      '',
      'この学習者が今すぐ答えやすく、次の一歩の判断材料になる問いを 1 つだけ返してください。',
    ]
      .filter((line): line is string => Boolean(line))
      .join('\n'),
  }
}
