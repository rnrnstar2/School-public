import { execa } from 'execa'

import type { CritiqueAdapter, DraftAdapter } from '../base.js'
import type { Critique, LessonDraft, LessonDraftInput } from '../../core/types.js'

interface AdapterContext {
  instruction: string
}

function buildPrompt(instruction: string, payload: unknown): string {
  return `${instruction}\n\nReturn JSON only.\n\nINPUT:\n${JSON.stringify(payload, null, 2)}`
}

function stripMarkdownCodeFences(output: string): string {
  const trimmed = output.trim()

  // Try code fence extraction first
  if (trimmed.startsWith('```')) {
    const firstNewlineIndex = trimmed.indexOf('\n')
    if (firstNewlineIndex !== -1) {
      const header = trimmed.slice(0, firstNewlineIndex).trim().toLowerCase()
      if (header === '```' || header === '```json') {
        const endFence = trimmed.lastIndexOf('```')
        if (endFence > firstNewlineIndex) {
          return trimmed.slice(firstNewlineIndex + 1, endFence).trim()
        }
      }
    }
  }

  // If the output starts with '{', assume it's JSON (possibly with trailing text)
  if (trimmed.startsWith('{')) {
    return trimmed
  }

  // Extract the largest JSON object from conversational output
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace !== -1) {
    const candidate = trimmed.slice(firstBrace)
    // Find matching closing brace by counting nesting
    let depth = 0
    let inString = false
    let escape = false
    for (let i = 0; i < candidate.length; i++) {
      const ch = candidate[i]
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\' && inString) {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          return candidate.slice(0, i + 1)
        }
      }
    }
  }

  return trimmed
}

async function runClaudeJson(prompt: string): Promise<string> {
  const result = await execa('claude', ['--print', prompt], {
    reject: true,
  })
  return stripMarkdownCodeFences(result.stdout.trim())
}

export function createClaudeDraftAdapter(context: AdapterContext): DraftAdapter {
  return {
    async draftLesson(input: LessonDraftInput): Promise<LessonDraft> {
      const output = await runClaudeJson(buildPrompt(context.instruction, input))
      return JSON.parse(output) as LessonDraft
    },
  }
}

export function createClaudeCritiqueAdapter(context: AdapterContext): CritiqueAdapter {
  return {
    async critique(draft: LessonDraft): Promise<Critique> {
      const output = await runClaudeJson(buildPrompt(context.instruction, draft))
      return JSON.parse(output) as Critique
    },
  }
}
