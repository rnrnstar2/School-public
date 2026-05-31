import { readdir } from 'node:fs/promises'
import path from 'node:path'

import {
  getAssetsImagesDir,
  getAssetsVideosDir,
  getPersonasDir,
  getRubricsDir,
  getStagePromptPath,
} from '../core/paths.js'
import { schemaValidator } from '../core/schema-validator.js'
import {
  assetArraySchema,
  evalBundleSchema,
  intakeBundleSchema,
  publishBundleSchema,
} from '../core/types.js'
import type {
  Asset,
  Critique,
  EvalBundle,
  IntakeBundle,
  Lesson,
  LessonDraft,
  PersonaDefinition,
  PublishBundle,
  RubricDefinition,
  StageName,
} from '../core/types.js'
import { parseYaml, readTextFile, readYamlFile } from '../core/yaml-io.js'

export async function readStagePrompt(stage: StageName): Promise<string> {
  return readTextFile(getStagePromptPath(stage))
}

export async function loadStructuredInput<T>(input: string | T): Promise<T> {
  if (typeof input !== 'string') {
    return input
  }

  const extension = path.extname(input).toLowerCase()
  if (extension === '.yaml' || extension === '.yml') {
    return readYamlFile<T>(input)
  }

  const raw = await readTextFile(input)
  return JSON.parse(raw) as T
}

export async function validateIntakeBundle(bundle: unknown): Promise<IntakeBundle> {
  return schemaValidator.validateInlineSchema<IntakeBundle>(
    intakeBundleSchema.$id,
    intakeBundleSchema,
    bundle,
  )
}

export async function validateLessonDraft(draft: unknown): Promise<LessonDraft> {
  const validated = await schemaValidator.validateWithSchemaFile<LessonDraft>(
    'lesson-draft.schema.json',
    draft,
  )
  await parseLessonFromDraft(validated)
  return validated
}

export async function validateCritique(critique: unknown): Promise<Critique> {
  return schemaValidator.validateWithSchemaFile<Critique>('critique.schema.json', critique)
}

export async function validateAssets(assets: unknown): Promise<Asset[]> {
  return schemaValidator.validateInlineSchema<Asset[]>(
    assetArraySchema.$id,
    assetArraySchema,
    assets,
  )
}

export async function validateEvalBundle(bundle: unknown): Promise<EvalBundle> {
  return schemaValidator.validateInlineSchema<EvalBundle>(
    evalBundleSchema.$id,
    evalBundleSchema,
    bundle,
  )
}

export async function validatePublishBundle(bundle: unknown): Promise<PublishBundle> {
  return schemaValidator.validateInlineSchema<PublishBundle>(
    publishBundleSchema.$id,
    publishBundleSchema,
    bundle,
  )
}

export async function parseLessonFromDraft(draft: LessonDraft): Promise<Lesson> {
  const lesson = parseYaml<Lesson>(draft.lesson_yaml)
  return schemaValidator.validateWithSchemaFile<Lesson>('lesson.schema.json', lesson)
}

export function extractTraceFromBody(bodyMarkdown: string): string[] {
  const numberedLines = bodyMarkdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, ''))

  if (numberedLines.length > 0) {
    return numberedLines
  }

  const headingLines = bodyMarkdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('## '))
    .map((line) => line.replace(/^##\s+/, ''))

  return headingLines
}

export async function loadRubrics(): Promise<RubricDefinition[]> {
  const entries = await readdir(getRubricsDir(), { withFileTypes: true })
  const rubrics: RubricDefinition[] = []

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.gitkeep')) {
      continue
    }

    const absolutePath = path.join(getRubricsDir(), entry.name)
    rubrics.push(await loadStructuredInput<RubricDefinition>(absolutePath))
  }

  return rubrics
}

export async function loadPersonas(): Promise<PersonaDefinition[]> {
  const entries = await readdir(getPersonasDir(), { withFileTypes: true })
  const personas: PersonaDefinition[] = []

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.gitkeep')) {
      continue
    }

    const absolutePath = path.join(getPersonasDir(), entry.name)
    const loaded = await loadStructuredInput<unknown[] | unknown>(absolutePath)
    const normalized = (Array.isArray(loaded) ? loaded : [loaded]).map(normalizePersonaDefinition)
    personas.push(...normalized)
  }

  return personas
}

export async function findLessonAssetPaths(lessonId: string): Promise<string[]> {
  const results: string[] = []

  for (const directory of [getAssetsImagesDir(), getAssetsVideosDir()]) {
    const assetPaths = await listFilesRecursive(directory)
    for (const assetPath of assetPaths) {
      const relativePath = path.relative(directory, assetPath).replace(/\\/g, '/')

      if (
        relativePath.startsWith(`${lessonId}/`) ||
        path.basename(relativePath).startsWith(`${lessonId}.`)
      ) {
        results.push(assetPath)
      }
    }
  }

  return results.sort()
}

async function listFilesRecursive(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.gitkeep')) {
      continue
    }

    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(absolutePath))
      continue
    }

    if (entry.isFile()) {
      files.push(absolutePath)
    }
  }

  return files
}

export function findSlotForBrief(brief: string, availableSlots: string[], index: number): string {
  const explicitMatch = brief.match(/^([a-z_]+)\s+slot:/i)
  const explicitSlot = explicitMatch?.[1]

  if (explicitSlot && availableSlots.includes(explicitSlot)) {
    return explicitSlot
  }

  const mentioned = availableSlots.find((slot) => brief.includes(slot))
  if (mentioned) {
    return mentioned
  }

  const fallback = availableSlots[index]
  if (!fallback) {
    throw new Error(`Unable to map brief to media slot: ${brief}`)
  }

  return fallback
}

function normalizePersonaDefinition(input: unknown): PersonaDefinition {
  const record = (input ?? {}) as Record<string, unknown>

  if (
    typeof record.tag === 'string' &&
    typeof record.step_focus === 'string' &&
    typeof record.default_issue === 'string' &&
    typeof record.default_mitigation === 'string'
  ) {
    return {
      tag: record.tag,
      step_focus: record.step_focus,
      default_issue: record.default_issue,
      default_mitigation: record.default_mitigation,
    }
  }

  const personaId =
    typeof record.id === 'string'
      ? record.id.replace(/^persona\./, '')
      : typeof record.name === 'string'
        ? record.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        : 'persona'
  const goals = Array.isArray(record.goals)
    ? record.goals.filter((value): value is string => typeof value === 'string')
    : []
  const constraints = Array.isArray(record.constraints)
    ? record.constraints.filter((value): value is string => typeof value === 'string')
    : []
  const preferredTools = Array.isArray(record.preferred_tools)
    ? record.preferred_tools.filter((value): value is string => typeof value === 'string')
    : []

  return {
    tag: personaId || 'persona',
    step_focus: goals[0] ?? 'core workflow',
    default_issue: constraints[0] ?? 'Potential learner blocker needs explicit mitigation.',
    default_mitigation:
      preferredTools[0] != null
        ? `Anchor the explanation to ${preferredTools[0]}.`
        : 'Add one concrete operational hint for this persona.',
  }
}
