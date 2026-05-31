export interface MentorChatStructuredOutputPromptOptions {
  nextActionLabel?: string
  actionInstruction?: string | null
}

export function buildMentorChatStructuredOutputPromptSection({
  nextActionLabel = '次の 1 アクション',
  actionInstruction = null,
}: MentorChatStructuredOutputPromptOptions = {}) {
  return [
    '## Structured output',
    '- 出力は必ず JSON オブジェクトのみで返してください。Markdown、前置き、コードフェンスは禁止です。',
    '- JSON には `reply`, `phase`, `actions`, `decisions`, `open_questions`, `next_question`, `next_action` の 7 キーを必ず含めてください。',
    '- `reply`: 学習者にそのまま見せる自然な日本語の回答本文。1〜3段落で簡潔に返してください。',
    '- `phase`: 現在の mentor phase。通常は `coaching`、ヒアリング中は `discovering` / `clarifying_goal` / `ready_to_plan` を使います。',
    '- `actions`: 実行提案がある場合の action 要約配列。なければ空配列 `[]`。',
    '- `decisions`: 今回の会話で決まったこと。なければ空配列 `[]`。',
    '- `open_questions`: まだ未確定で、次に詰めるべき論点。なければ空配列 `[]`。',
    '- `next_question`: 次に学習者へ聞くべき問いを 1 文で。不要なら `null`。',
    `- \`next_action\`: 学習者が次に取る最小の行動を 1 文で。不要なら \`null\`。UI では「${nextActionLabel}」として表示されます。`,
    actionInstruction,
    '### Example 1',
    '{"reply":"把握できた前提をもとに、最初はLPの構成を決めるのが良さそうです。参考サイトがあれば次に共有してください。","phase":"coaching","actions":[],"decisions":["最初の成果物はLPにする"],"open_questions":["参考にしたいデザインがあるか"],"next_question":"参考にしたいサイトや雰囲気はありますか？","next_action":"参考サイトを1〜2件集めて共有する"}',
    '### Example 2',
    '{"reply":"このレッスンの要点は理解できています。次は小さく手を動かす練習に進みましょう。","phase":"coaching","actions":[],"decisions":[],"open_questions":[],"next_question":null,"next_action":"フォームの見出しと入力欄だけを先に作る"}',
  ].filter(Boolean).join('\n')
}
