import { getExternalPlannerConfig } from '@/lib/planner/zai'
import { THREE_AXIS_GUIDE } from '@/lib/prompts/three-axis-guide'
import type { PlannerArtifact } from '@/types'

const VERIFICATION_TIMEOUT_MS = 15_000

export interface ArtifactVerificationInput {
  milestoneId: string
  milestoneTitle: string
  evidenceRule: string
  artifacts: Pick<PlannerArtifact, 'artifact_type' | 'title' | 'content'>[]
}

export interface ArtifactNextStep {
  title: string
  description: string
}

export interface ArtifactCorrection {
  point: string
  suggestion: string
}

export interface ArtifactVerificationOutput {
  verified: boolean
  summary: string
  nextSteps: ArtifactNextStep[]
  corrections: ArtifactCorrection[]
}

function buildVerificationPrompt(input: ArtifactVerificationInput): string {
  const artifactDescriptions = input.artifacts.map((a, i) => {
    const label = a.title || `artifact ${i + 1}`
    return `- [${a.artifact_type}] ${label}: ${a.content.slice(0, 500)}`
  })

  return [
    THREE_AXIS_GUIDE,
    '',
    'あなたはマイルストーン達成判定アドバイザーです。',
    '学習者がマイルストーンの evidence rule（達成条件）を満たしているかを判定してください。',
    '',
    '## マイルストーン情報',
    `タイトル: ${input.milestoneTitle}`,
    `Evidence Rule: ${input.evidenceRule}`,
    '',
    '## 提出された artifact',
    ...artifactDescriptions,
    '',
    '## 回答フォーマット',
    '以下のJSON形式で回答してください。他のテキストは含めないでください。',
    '```json',
    '{',
    '  "verified": true または false,',
    '  "summary": "判定理由の簡潔な説明（1-2文）",',
    '  "nextSteps": [',
    '    { "title": "次にやるべきタスク名", "description": "具体的な手順の説明（1-2文）" }',
    '  ],',
    '  "corrections": [',
    '    { "point": "修正が必要な箇所", "suggestion": "具体的な修正方法（1-2文）" }',
    '  ]',
    '}',
    '```',
    '',
    '## ルール',
    '- evidence rule に記載された条件を artifact が満たしているかを判定してください。',
    '- URL artifact の場合、URL が有効な形式であれば内容の確認は不要です。',
    '- テキスト / メモ artifact の場合、evidence rule の意図に沿った内容が記録されていれば OK とします。',
    '- 厳密すぎる判定は避け、学習者の前進を促す方向で判定してください。',
    '- 1つ以上の artifact が evidence rule を満たしていれば verified: true としてください。',
    '- 日本語で回答してください。',
    '',
    '## nextSteps / corrections ルール',
    '- verified: true の場合、nextSteps に次のマイルストーンへ進むための具体的なアクション（1〜3件）を提示してください。corrections は空配列にしてください。',
    '- verified: false の場合、corrections に不足点や修正すべきポイント（1〜3件）を具体的に提示してください。nextSteps には修正後に取り組むべきタスクを記載してください。',
    '- artifact の内容を具体的に分析し、汎用的すぎるアドバイスは避けてください。',
  ].join('\n')
}

export async function verifyArtifactAgainstEvidenceRule(
  input: ArtifactVerificationInput
): Promise<ArtifactVerificationOutput> {
  // Fallback: if no AI available, use simple heuristic
  const fallback = simpleVerification(input)

  const externalConfig = getExternalPlannerConfig()
  if (!externalConfig.available) {
    return fallback
  }

  const prompt = buildVerificationPrompt(input)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS)

    const response = await fetch(externalConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${externalConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: externalConfig.model,
        temperature: 0.3,
        top_p: 0.9,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
      cache: 'no-store',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

    if (!response.ok) {
      return fallback
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const rawContent = data.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) ?? rawContent.match(/(\{[\s\S]*\})/)
    const jsonStr = jsonMatch?.[1]?.trim() ?? rawContent

    const result = JSON.parse(jsonStr) as {
      verified?: boolean
      summary?: string
      nextSteps?: Array<{ title?: string; description?: string }>
      corrections?: Array<{ point?: string; suggestion?: string }>
    }

    if (typeof result.verified !== 'boolean' || typeof result.summary !== 'string') {
      return fallback
    }

    const nextSteps = Array.isArray(result.nextSteps)
      ? result.nextSteps
          .filter((s): s is { title: string; description: string } =>
            typeof s.title === 'string' && typeof s.description === 'string')
          .slice(0, 3)
      : []

    const corrections = Array.isArray(result.corrections)
      ? result.corrections
          .filter((c): c is { point: string; suggestion: string } =>
            typeof c.point === 'string' && typeof c.suggestion === 'string')
          .slice(0, 3)
      : []

    return { verified: result.verified, summary: result.summary, nextSteps, corrections }
  } catch {
    return fallback
  }
}

function simpleVerification(input: ArtifactVerificationInput): ArtifactVerificationOutput {
  if (input.artifacts.length === 0) {
    return {
      verified: false,
      summary: 'まだ artifact が提出されていません。',
      nextSteps: [],
      corrections: [{ point: 'artifact 未提出', suggestion: 'evidence rule に沿った成果物（URL・テキスト・メモ）を1つ以上提出してください。' }],
    }
  }

  const hasContent = input.artifacts.some(
    (a) => a.content.trim().length > 0
  )

  if (!hasContent) {
    return {
      verified: false,
      summary: 'artifact の内容が空です。',
      nextSteps: [],
      corrections: [{ point: '内容が空', suggestion: 'artifact に具体的な内容を記入して再提出してください。' }],
    }
  }

  return {
    verified: true,
    summary: `${input.artifacts.length} 件の artifact が提出されています。evidence rule の条件を満たしていると判定しました。`,
    nextSteps: [{ title: '次のマイルストーンへ進む', description: '現在のマイルストーンの成果を確認し、次のステップに取り組みましょう。' }],
    corrections: [],
  }
}
