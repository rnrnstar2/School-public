import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'

export type EvalDatasetSplit = 'train' | 'validation' | 'all'

export interface GoalRecord {
  goalId: string
  text: string
  domain: string
  personaHint?: string
  createdAt: string
}

export interface ExpectedActionRecord {
  goalId: string
  actionId: string
  canonical: {
    capability: string
    outcome: string
    blocker: string[]
    stack: string[]
  }
}

export interface ExpectedLessonRecord {
  actionId: string
  lessonOrAtomId: string | null
  expectedCoverageScore: number
  gap: boolean
}

export interface ExpectedGapRecord {
  actionId: string
  reason: string
  expectedProposalPriority: 'high' | 'mid' | 'low'
}

export interface EvalDataset {
  version: string
  split: EvalDatasetSplit
  goals: GoalRecord[]
  expectedActions: ExpectedActionRecord[]
  expectedLessons: ExpectedLessonRecord[]
  expectedGaps: ExpectedGapRecord[]
}

export interface WorkspaceLessonValidationResult {
  availableIds: string[]
  missingIds: string[]
}

export interface LoadEvalDatasetOptions {
  split?: EvalDatasetSplit
  rootDir?: string
  workspaceRoot?: string
}

interface EvalSchema {
  $id?: string
  $defs: Record<string, unknown>
}

type DatasetFileKey = 'goals' | 'expectedActions' | 'expectedLessons' | 'expectedGaps'

const DATASET_FILE_CONFIG: Record<
  DatasetFileKey,
  { filename: string; ref: string }
> = {
  goals: {
    filename: 'goals.jsonl',
    ref: '#/$defs/goalsFile',
  },
  expectedActions: {
    filename: 'expected-actions.jsonl',
    ref: '#/$defs/expectedActionsFile',
  },
  expectedLessons: {
    filename: 'expected-lessons.jsonl',
    ref: '#/$defs/expectedLessonsFile',
  },
  expectedGaps: {
    filename: 'expected-gaps.jsonl',
    ref: '#/$defs/expectedGapsFile',
  },
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = path.resolve(MODULE_DIR, '../../../../')

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined) {
  if (!errors || errors.length === 0) {
    return 'unknown schema validation error'
  }

  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'invalid'}`.trim())
    .join('; ')
}

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  const raw = await fs.readFile(filePath, 'utf8')
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as T
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid JSON'
      throw new Error(`Failed to parse ${path.basename(filePath)} line ${index + 1}: ${message}`)
    }
  })
}

async function loadSchema(schemaPath: string): Promise<EvalSchema> {
  const raw = await fs.readFile(schemaPath, 'utf8')
  return JSON.parse(raw) as EvalSchema
}

function buildSchemaValidators(schema: EvalSchema) {
  const schemaId = schema.$id ?? 'https://school.local/eval-datasets/goal-action/schema.json'
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  })

  ajv.addSchema(schema, schemaId)

  const validators = {} as Record<DatasetFileKey, ValidateFunction<unknown>>

  for (const [fileKey, config] of Object.entries(DATASET_FILE_CONFIG) as Array<[DatasetFileKey, { filename: string; ref: string }]>) {
    validators[fileKey] = ajv.compile({
      $ref: `${schemaId}${config.ref}`,
    })
  }

  return validators
}

function groupBy<T, K extends string>(items: T[], getKey: (item: T) => K) {
  const grouped = new Map<K, T[]>()

  for (const item of items) {
    const key = getKey(item)
    const current = grouped.get(key) ?? []
    current.push(item)
    grouped.set(key, current)
  }

  return grouped
}

function requireUnique(values: string[], label: string) {
  const seen = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}`)
    }

    seen.add(value)
  }
}

export function resolveGoalSplit(goalId: string): Exclude<EvalDatasetSplit, 'all'> {
  const hashPrefix = createHash('sha256').update(goalId).digest('hex').slice(0, 8)
  const bucket = Number.parseInt(hashPrefix, 16) % 10
  return bucket < 7 ? 'train' : 'validation'
}

async function collectIdsFromAtomDirectory(workspaceRoot: string) {
  const atomDir = path.join(workspaceRoot, 'lesson-factory/lessons/atoms')
  const ids = new Set<string>()

  if (!(await fileExists(atomDir))) {
    return ids
  }

  const entries = await fs.readdir(atomDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) {
      continue
    }

    ids.add(entry.name.replace(/\.yaml$/u, ''))
  }

  return ids
}

async function collectQuotedIdsFromFile(filePath: string) {
  const ids = new Set<string>()

  if (!(await fileExists(filePath))) {
    return ids
  }

  const raw = await fs.readFile(filePath, 'utf8')

  for (const match of raw.matchAll(/["']((?:atom|lesson)\.[a-z0-9._-]+)["']/gu)) {
    ids.add(match[1])
  }

  return ids
}

async function collectIdsFromCurriculumLibrary(workspaceRoot: string) {
  const curriculumDir = path.join(workspaceRoot, 'apps/web/src/lib/curriculum')
  const ids = new Set<string>()

  if (!(await fileExists(curriculumDir))) {
    return ids
  }

  const entries = await fs.readdir(curriculumDir, { withFileTypes: true })
  const curriculumSourceFiles = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith('.ts'),
  )

  for (const entry of curriculumSourceFiles) {
    const raw = await fs.readFile(path.join(curriculumDir, entry.name), 'utf8')
    for (const match of raw.matchAll(/["'`](?:atom|lesson)\.[a-z0-9._-]+["'`]/gu)) {
      ids.add(match[0].slice(1, -1))
    }
  }

  return ids
}

async function collectWorkspaceLessonIds(workspaceRoot: string) {
  const [atomIds, curriculumIds, seedIds, canonicalSeedIds] = await Promise.all([
    collectIdsFromAtomDirectory(workspaceRoot),
    collectIdsFromCurriculumLibrary(workspaceRoot),
    collectQuotedIdsFromFile(path.join(workspaceRoot, 'apps/web/supabase/seed.sql')),
    collectQuotedIdsFromFile(path.join(workspaceRoot, 'apps/web/supabase/seed-canonical.sql')),
  ])

  return Array.from(new Set([
    ...atomIds,
    ...curriculumIds,
    ...seedIds,
    ...canonicalSeedIds,
  ])).sort()
}

export async function validateLessonIdsAgainstWorkspace(
  lessons: ExpectedLessonRecord[],
  options: { workspaceRoot?: string } = {},
): Promise<WorkspaceLessonValidationResult> {
  const workspaceRoot = options.workspaceRoot ?? DEFAULT_REPO_ROOT
  const availableIds = await collectWorkspaceLessonIds(workspaceRoot)
  const availableIdSet = new Set(availableIds)

  const expectedIds = Array.from(
    new Set(
      lessons
        .map((lesson) => lesson.lessonOrAtomId)
        .filter((lessonOrAtomId): lessonOrAtomId is string => lessonOrAtomId !== null),
    ),
  )

  const missingIds = expectedIds.filter((id) => !availableIdSet.has(id)).sort()

  return {
    availableIds,
    missingIds,
  }
}

function validateDatasetIntegrity(dataset: {
  goals: GoalRecord[]
  expectedActions: ExpectedActionRecord[]
  expectedLessons: ExpectedLessonRecord[]
  expectedGaps: ExpectedGapRecord[]
}) {
  requireUnique(dataset.goals.map((goal) => goal.goalId), 'goalId')
  requireUnique(dataset.expectedActions.map((action) => action.actionId), 'actionId')
  requireUnique(dataset.expectedGaps.map((gap) => gap.actionId), 'gap actionId')

  const domainCount = new Set(dataset.goals.map((goal) => goal.domain)).size
  assert(domainCount >= 3, 'Dataset must span at least 3 domains')
  assert(dataset.expectedGaps.length >= 5, 'Dataset must contain at least 5 expected gaps')

  const goalIds = new Set(dataset.goals.map((goal) => goal.goalId))
  const actionIds = new Set(dataset.expectedActions.map((action) => action.actionId))
  const actionsByGoal = groupBy(dataset.expectedActions, (action) => action.goalId)
  const lessonsByAction = groupBy(dataset.expectedLessons, (lesson) => lesson.actionId)
  const gapActionIds = new Set(dataset.expectedGaps.map((gap) => gap.actionId))

  for (const action of dataset.expectedActions) {
    assert(goalIds.has(action.goalId), `Action ${action.actionId} references missing goal ${action.goalId}`)
  }

  for (const goal of dataset.goals) {
    const actions = actionsByGoal.get(goal.goalId) ?? []
    assert(
      actions.length >= 3 && actions.length <= 10,
      `Goal ${goal.goalId} must have between 3 and 10 actions, found ${actions.length}`,
    )
  }

  for (const action of dataset.expectedActions) {
    const lessons = lessonsByAction.get(action.actionId) ?? []
    assert(lessons.length === 1, `Action ${action.actionId} must have exactly 1 lesson expectation`)

    const lesson = lessons[0]
    const isGapAction = gapActionIds.has(action.actionId)

    if (isGapAction) {
      assert(lesson.gap, `Gap action ${action.actionId} must be marked gap: true`)
      assert(lesson.lessonOrAtomId === null, `Gap action ${action.actionId} must not reference lessonOrAtomId`)
      assert(lesson.expectedCoverageScore === 0, `Gap action ${action.actionId} must have coverage score 0`)
      assert(
        resolveGoalSplit(action.goalId) === 'validation',
        `Gap action ${action.actionId} must belong to validation split`,
      )
      continue
    }

    assert(!lesson.gap, `Non-gap action ${action.actionId} must be marked gap: false`)
    assert(Boolean(lesson.lessonOrAtomId), `Non-gap action ${action.actionId} must reference lessonOrAtomId`)
    assert(lesson.expectedCoverageScore > 0, `Non-gap action ${action.actionId} must have positive coverage score`)
  }

  for (const gap of dataset.expectedGaps) {
    assert(
      actionIds.has(gap.actionId),
      `Gap ${gap.actionId} references missing expected action (typo or stale entry)`,
    )
    assert(lessonsByAction.has(gap.actionId), `Gap ${gap.actionId} is missing lesson expectation`)
  }
}

export async function loadEvalDataset(
  version: string,
  options: LoadEvalDatasetOptions = {},
): Promise<EvalDataset> {
  const split = options.split ?? 'all'
  const rootDir = options.rootDir ?? DEFAULT_REPO_ROOT
  const workspaceRoot = options.workspaceRoot ?? DEFAULT_REPO_ROOT

  assert(['train', 'validation', 'all'].includes(split), `Unsupported split: ${split}`)

  const datasetDir = path.join(rootDir, 'eval-datasets/goal-action', version)
  const schemaPath = path.join(datasetDir, 'schema.json')
  const schema = await loadSchema(schemaPath)
  const validators = buildSchemaValidators(schema)

  const goals = await readJsonlFile<GoalRecord>(path.join(datasetDir, DATASET_FILE_CONFIG.goals.filename))
  const expectedActions = await readJsonlFile<ExpectedActionRecord>(
    path.join(datasetDir, DATASET_FILE_CONFIG.expectedActions.filename),
  )
  const expectedLessons = await readJsonlFile<ExpectedLessonRecord>(
    path.join(datasetDir, DATASET_FILE_CONFIG.expectedLessons.filename),
  )
  const expectedGaps = await readJsonlFile<ExpectedGapRecord>(
    path.join(datasetDir, DATASET_FILE_CONFIG.expectedGaps.filename),
  )

  const collections = {
    goals,
    expectedActions,
    expectedLessons,
    expectedGaps,
  }

  for (const fileKey of Object.keys(collections) as DatasetFileKey[]) {
    const valid = validators[fileKey](collections[fileKey])
    if (!valid) {
      throw new Error(
        `${DATASET_FILE_CONFIG[fileKey].filename} schema validation failed: ${formatAjvErrors(validators[fileKey].errors)}`,
      )
    }
  }

  validateDatasetIntegrity(collections)

  const workspaceValidation = await validateLessonIdsAgainstWorkspace(expectedLessons, {
    workspaceRoot,
  })

  if (workspaceValidation.missingIds.length > 0) {
    throw new Error(`Unknown lesson or atom ids: ${workspaceValidation.missingIds.join(', ')}`)
  }

  if (split === 'all') {
    return {
      version,
      split,
      goals,
      expectedActions,
      expectedLessons,
      expectedGaps,
    }
  }

  const filteredGoals = goals.filter((goal) => resolveGoalSplit(goal.goalId) === split)
  const allowedGoalIds = new Set(filteredGoals.map((goal) => goal.goalId))
  const filteredActions = expectedActions.filter((action) => allowedGoalIds.has(action.goalId))
  const allowedActionIds = new Set(filteredActions.map((action) => action.actionId))

  return {
    version,
    split,
    goals: filteredGoals,
    expectedActions: filteredActions,
    expectedLessons: expectedLessons.filter((lesson) => allowedActionIds.has(lesson.actionId)),
    expectedGaps: expectedGaps.filter((gap) => allowedActionIds.has(gap.actionId)),
  }
}
