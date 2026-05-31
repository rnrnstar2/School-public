import { GoogleGenAI } from '@google/genai'

import type { CritiqueAdapter, DraftAdapter } from '../base.js'
import type { Critique, LessonDraft, LessonDraftInput } from '../../core/types.js'

interface AdapterContext {
  instruction: string
}

const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash'

function buildPrompt(instruction: string, payload: unknown): string {
  return `${instruction}\n\nReturn JSON only.\n\nINPUT:\n${JSON.stringify(payload, null, 2)}`
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY for Gemini adapter. export GEMINI_API_KEY=your_api_key')
  }

  return new GoogleGenAI({ apiKey })
}

function getTextModel(): string {
  return process.env.LESSON_FACTORY_GEMINI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL
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

async function runGeminiJson(ai: GoogleGenAI, prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: getTextModel(),
    contents: prompt,
  })
  const text = response.text?.trim()

  if (!text) {
    throw new Error('Gemini returned an empty text response.')
  }

  return stripMarkdownCodeFences(text)
}

export function createGeminiDraftAdapter(context: AdapterContext): DraftAdapter {
  const ai = createGeminiClient()

  return {
    async draftLesson(input: LessonDraftInput): Promise<LessonDraft> {
      const output = await runGeminiJson(ai, buildPrompt(context.instruction, input))
      return JSON.parse(output) as LessonDraft
    },
  }
}

export function createGeminiCritiqueAdapter(context: AdapterContext): CritiqueAdapter {
  const ai = createGeminiClient()

  return {
    async critique(draft: LessonDraft): Promise<Critique> {
      const output = await runGeminiJson(ai, buildPrompt(context.instruction, draft))
      return JSON.parse(output) as Critique
    },
  }
}
