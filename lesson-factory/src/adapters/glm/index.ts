import type { CritiqueAdapter, DraftAdapter } from '../base.js'
import type { Critique, LessonDraft, LessonDraftInput } from '../../core/types.js'

interface AdapterContext {
  instruction: string
}

function buildPrompt(instruction: string, payload: unknown): string {
  return `${instruction}\n\nReturn JSON only.\n\nINPUT:\n${JSON.stringify(payload, null, 2)}`
}

function stripMarkdownCodeFences(output: string): string {
  if (!output.startsWith('```') || !output.endsWith('```')) {
    return output
  }

  const firstNewlineIndex = output.indexOf('\n')
  if (firstNewlineIndex === -1) {
    return output
  }

  const header = output.slice(0, firstNewlineIndex).trim().toLowerCase()
  if (header !== '```' && header !== '```json') {
    return output
  }

  return output.slice(firstNewlineIndex + 1, -3).trim()
}

async function runGlmJson(prompt: string): Promise<string> {
  const apiKey = process.env.GLM_API_KEY

  if (!apiKey) {
    throw new Error('Missing GLM_API_KEY for GLM adapter. export GLM_API_KEY=your_api_key')
  }

  const response = await fetch('https://open.bigmodel.cn/api/coding/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.LESSON_FACTORY_GLM_MODEL ?? 'glm-5.1',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 16384,
    }),
  })

  if (!response.ok) {
    throw new Error(`GLM HTTP ${response.status}: ${await response.text()}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
      }
    }>
  }
  const text = data.choices?.[0]?.message?.content?.trim()

  if (!text) {
    throw new Error('GLM returned no content')
  }

  return stripMarkdownCodeFences(text)
}

export function createGlmDraftAdapter(context: AdapterContext): DraftAdapter {
  return {
    async draftLesson(input: LessonDraftInput): Promise<LessonDraft> {
      const output = await runGlmJson(buildPrompt(context.instruction, input))
      return JSON.parse(output) as LessonDraft
    },
  }
}

export function createGlmCritiqueAdapter(context: AdapterContext): CritiqueAdapter {
  return {
    async critique(draft: LessonDraft): Promise<Critique> {
      const output = await runGlmJson(buildPrompt(context.instruction, draft))
      return JSON.parse(output) as Critique
    },
  }
}
