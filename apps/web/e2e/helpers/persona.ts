import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'

export interface PersonaDefinition {
  id: string
  name: string
  background: string
  goalSeed: string
  expectedTrack: string
  hearingAnswers: Record<string, string>
  successCriteria: {
    maxStepsToFirstLesson: number
    maxAiFrictionEvents: number
    maxDurationMs: number
    requiresNoCode: boolean
  }
}

interface RawPersonaDefinition {
  id: string
  name: string
  background: string
  goal_seed: string
  expected_track: string
  hearing_answers: Record<string, string>
  success_criteria: {
    max_steps_to_first_lesson: number
    max_ai_friction_events: number
    max_duration_ms: number
    requires_no_code: boolean
  }
}

interface PersonasFile {
  version: number
  updated_at: string
  personas: RawPersonaDefinition[]
}

interface HearingTurnResult {
  completed: boolean
  session: {
    answers?: Record<string, string>
    lastQuestionId?: string | null
    messages?: Array<{ role?: string; content?: string }>
  } | null
}

const PERSONAS_PATH_CANDIDATES = [
  resolve(process.cwd(), 'docs/swarmops/personas.yaml'),
  resolve(process.cwd(), '../docs/swarmops/personas.yaml'),
  resolve(process.cwd(), '../../docs/swarmops/personas.yaml'),
] as const

function resolvePersonasPath() {
  const match = PERSONAS_PATH_CANDIDATES.find((candidate) => existsSync(candidate))

  if (!match) {
    throw new Error('docs/swarmops/personas.yaml could not be resolved from the current working directory.')
  }

  return match
}

function toCamelCase(value: string) {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
}

function parseScalar(value: string) {
  const trimmed = value.trim()

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1)
  }

  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed)
  }

  return trimmed
}

function parsePersonasYaml(text: string): PersonasFile {
  const lines = text.replace(/\r/g, '').split('\n')
  const personas: RawPersonaDefinition[] = []
  let version = 1
  let updatedAt = ''
  let currentPersona: RawPersonaDefinition | null = null
  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index] ?? ''
    const trimmed = rawLine.trim()

    if (!trimmed || trimmed.startsWith('#') || trimmed === 'personas:') {
      index += 1
      continue
    }

    const versionMatch = rawLine.match(/^version:\s*(.+)$/)
    if (versionMatch) {
      version = Number(parseScalar(versionMatch[1] ?? '1'))
      index += 1
      continue
    }

    const updatedAtMatch = rawLine.match(/^updated_at:\s*(.+)$/)
    if (updatedAtMatch) {
      updatedAt = String(parseScalar(updatedAtMatch[1] ?? ''))
      index += 1
      continue
    }

    const personaMatch = rawLine.match(/^  - id:\s*(.+)$/)
    if (personaMatch) {
      if (currentPersona) {
        personas.push(currentPersona)
      }

      currentPersona = {
        id: String(parseScalar(personaMatch[1] ?? '')),
        name: '',
        background: '',
        goal_seed: '',
        expected_track: '',
        hearing_answers: {},
        success_criteria: {
          max_steps_to_first_lesson: 0,
          max_ai_friction_events: 0,
          max_duration_ms: 0,
          requires_no_code: false,
        },
      }
      index += 1
      continue
    }

    if (!currentPersona) {
      index += 1
      continue
    }

    const fieldMatch = rawLine.match(/^    ([a-z_]+):\s*(.*)$/)
    if (!fieldMatch) {
      index += 1
      continue
    }

    const [, key, value = ''] = fieldMatch

    if (key === 'background' && value.trim() === '|') {
      const backgroundLines: string[] = []
      index += 1
      while (index < lines.length) {
        const backgroundLine = lines[index] ?? ''
        if (backgroundLine.startsWith('      ')) {
          backgroundLines.push(backgroundLine.slice(6))
          index += 1
          continue
        }
        if (!backgroundLine.trim()) {
          backgroundLines.push('')
          index += 1
          continue
        }
        break
      }
      currentPersona.background = backgroundLines.join('\n').trimEnd()
      continue
    }

    if (key === 'hearing_answers') {
      index += 1
      while (index < lines.length) {
        const nestedLine = lines[index] ?? ''
        const nestedMatch = nestedLine.match(/^      ([a-z_]+):\s*(.+)$/)
        if (!nestedMatch) {
          break
        }

        currentPersona.hearing_answers[nestedMatch[1]] = String(parseScalar(nestedMatch[2] ?? ''))
        index += 1
      }
      continue
    }

    if (key === 'success_criteria') {
      index += 1
      while (index < lines.length) {
        const nestedLine = lines[index] ?? ''
        const nestedMatch = nestedLine.match(/^      ([a-z_]+):\s*(.+)$/)
        if (!nestedMatch) {
          break
        }

        const nestedKey = nestedMatch[1]
        const nestedValue = parseScalar(nestedMatch[2] ?? '')
        ;(currentPersona.success_criteria as Record<string, number | boolean>)[nestedKey] =
          nestedValue as number | boolean
        index += 1
      }
      continue
    }

    if (key === 'name' || key === 'goal_seed' || key === 'expected_track') {
      ;(currentPersona as unknown as Record<string, unknown>)[key] = parseScalar(value)
    }
    index += 1
  }

  if (currentPersona) {
    personas.push(currentPersona)
  }

  return {
    version,
    updated_at: updatedAt,
    personas,
  }
}

function getLastAssistantMessage(messages: Array<{ role?: string; content?: string }> | undefined) {
  return [...(messages ?? [])]
    .reverse()
    .find((message) => message.role === 'assistant' && typeof message.content === 'string')
    ?.content?.trim() ?? ''
}

function inferQuestionIdFromPrompt(prompt: string) {
  const normalized = prompt.toLowerCase()

  if (/(担当|業務|業界|業種)/.test(normalized)) {
    return 'industry'
  }

  if (/(困|課題|時間|負担|痛)/.test(normalized)) {
    return 'currentPain'
  }

  if (/(ツール|使える|データソース|環境)/.test(normalized)) {
    return 'toolsAvailable'
  }

  if (/(時間|週|使え)/.test(normalized)) {
    return 'timePerWeek'
  }

  return null
}

function parseHearingResultSse(body: string): HearingTurnResult {
  const chunks = body.split('\n\n')

  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)

    const eventLine = lines.find((line) => line.startsWith('event: '))
    const dataLine = lines.find((line) => line.startsWith('data: '))

    if (!eventLine || !dataLine) {
      continue
    }

    if (eventLine === 'event: error') {
      throw new Error(JSON.parse(dataLine.slice(6)).message ?? 'planner hearing mock returned an error event.')
    }

    if (eventLine === 'event: result') {
      return JSON.parse(dataLine.slice(6)) as HearingTurnResult
    }
  }

  throw new Error('planner hearing mock did not emit a result event.')
}

async function postHearingTurn(page: Page, payload: {
  goal: string
  answer: string | null
  session: HearingTurnResult['session'] | null
}) {
  const body = await page.evaluate(async (requestBody) => {
    const response = await fetch('/api/planner/hearing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    return await response.text()
  }, payload)

  return parseHearingResultSse(body)
}

export async function loadPersona(id: string): Promise<PersonaDefinition> {
  const manifest = parsePersonasYaml(await readFile(resolvePersonasPath(), 'utf8'))
  const rawPersona = manifest.personas.find((persona) => persona.id === id)

  if (!rawPersona) {
    throw new Error(`Persona ${id} is not registered in docs/swarmops/personas.yaml.`)
  }

  const hearingAnswers = Object.fromEntries(
    Object.entries(rawPersona.hearing_answers).map(([key, value]) => [toCamelCase(key), value]),
  )

  return {
    id: rawPersona.id,
    name: rawPersona.name,
    background: rawPersona.background,
    goalSeed: rawPersona.goal_seed,
    expectedTrack: rawPersona.expected_track,
    hearingAnswers,
    successCriteria: {
      maxStepsToFirstLesson: rawPersona.success_criteria.max_steps_to_first_lesson,
      maxAiFrictionEvents: rawPersona.success_criteria.max_ai_friction_events,
      maxDurationMs: rawPersona.success_criteria.max_duration_ms,
      requiresNoCode: rawPersona.success_criteria.requires_no_code,
    },
  }
}

export async function answerHearingAsPersona(
  page: Page,
  persona: PersonaDefinition,
  opts: { maxTurns?: number } = {},
): Promise<void> {
  const maxTurns = opts.maxTurns ?? Math.max(Object.keys(persona.hearingAnswers).length + 1, 1)
  let session: HearingTurnResult['session'] = null
  let answer: string | null = null

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const result = await postHearingTurn(page, {
      goal: persona.goalSeed,
      answer,
      session,
    })

    if (result.completed) {
      return
    }

    session = result.session

    const questionId = typeof result.session?.lastQuestionId === 'string' && result.session.lastQuestionId.trim()
      ? result.session.lastQuestionId.trim()
      : inferQuestionIdFromPrompt(getLastAssistantMessage(result.session?.messages))

    if (!questionId) {
      throw new Error('Could not infer the next persona hearing question id.')
    }

    answer = persona.hearingAnswers[questionId] ?? null

    if (!answer) {
      throw new Error(`Persona ${persona.id} does not define hearingAnswers.${questionId}.`)
    }
  }

  throw new Error(`Persona hearing did not complete within ${maxTurns} turns.`)
}
