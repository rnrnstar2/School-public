import { access } from 'node:fs/promises'
import path from 'node:path'

import {
  buildCoverageIndex,
  type CoverageIndex,
} from '../../coverage/src/index'
import { detectGaps, type LessonGap } from '@school/goal-action-gaps'
import { matchActions, type ActionLessonMapping } from '@school/goal-action-matcher'
import {
  normalizeActions,
  type CanonicalAction,
} from '../../normalizer/src/index'
import { generateProposals } from '@school/goal-action-proposer'

import type {
  GapWriterInput,
  MatcherWriterInput,
  ProposerWriterInput,
  Writers,
} from './runner'

export interface CreateRealWritersOptions {
  coverageIndex?: CoverageIndex
  workspaceRoot?: string
}

type RawEvalAction = NonNullable<MatcherWriterInput['rawAction']>

function toKey(goalId: string, actionId: string) {
  return `${goalId}|${actionId}`
}

function toGoalIdOrNull(goalId: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(goalId)
    ? goalId
    : null
}

async function pathExists(targetPath: string) {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

async function resolveWorkspaceRoot(start: string) {
  let current = path.resolve(start)

  while (true) {
    if (await pathExists(path.join(current, 'pnpm-workspace.yaml'))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return path.resolve(start)
    }
    current = parent
  }
}

function toNormalizedCanonicalAction(
  input: MatcherWriterInput,
): CanonicalAction | null {
  if (!input.rawAction) {
    return null
  }

  const raw = input.rawAction
  const normalized = normalizeActions({
    goal: input.goalText?.trim() || input.actionId,
    rawActions: [
      {
        id: input.actionId,
        title: `${raw.capability} ${raw.outcome}`,
        description: raw.blocker.join(' '),
        stack: raw.stack,
      },
    ],
  })

  return normalized[0] ?? null
}

async function loadCoverageIndex(workspaceRoot: string) {
  return buildCoverageIndex({
    factorySources: [
      {
        dir: path.join(workspaceRoot, 'lesson-factory/lessons/atoms'),
      },
    ],
  })
}

export function createRealWriters(
  options: CreateRealWritersOptions = {},
): Writers {
  const canonicalActionCache = new Map<string, CanonicalAction | null>()
  const mappingCache = new Map<string, Promise<ActionLessonMapping[]>>()
  const gapCache = new Map<string, Promise<LessonGap | null>>()

  const coverageIndexPromise = (async () => {
    if (options.coverageIndex) {
      return options.coverageIndex
    }

    const workspaceRoot = await resolveWorkspaceRoot(
      options.workspaceRoot ?? process.cwd(),
    )
    return loadCoverageIndex(workspaceRoot)
  })()

  const resolveCanonicalAction = (input: MatcherWriterInput) => {
    const key = toKey(input.goalId, input.actionId)
    if (canonicalActionCache.has(key)) {
      return canonicalActionCache.get(key) ?? null
    }

    const normalized = toNormalizedCanonicalAction(input)
    canonicalActionCache.set(key, normalized)
    return normalized
  }

  const resolveMappings = async (
    input: MatcherWriterInput,
  ): Promise<ActionLessonMapping[]> => {
    const key = toKey(input.goalId, input.actionId)
    const cached = mappingCache.get(key)
    if (cached) {
      return cached
    }

    const promise = (async () => {
      const action = resolveCanonicalAction(input)
      if (!action) {
        return []
      }

      const coverageIndex = await coverageIndexPromise
      return matchActions({
        actions: [action],
        coverageIndex,
        topK: 3,
      }).map((mapping) => ({
        ...mapping,
        goalId: toGoalIdOrNull(input.goalId),
      }))
    })()

    mappingCache.set(key, promise)
    return promise
  }

  const resolveGap = async (
    input: GapWriterInput,
  ): Promise<LessonGap | null> => {
    const key = toKey(input.goalId, input.actionId)
    const cached = gapCache.get(key)
    if (cached) {
      return cached
    }

    const promise = (async () => {
      const mappings = await resolveMappings(input)
      if (mappings.length === 0) {
        return null
      }

      const gap = detectGaps({
        mappings,
        now: new Date().toISOString(),
      }).find((candidate) => candidate.actionId === input.actionId)

      return gap ?? null
    })()

    gapCache.set(key, promise)
    return promise
  }

  return {
    async matcher(input) {
      const mappings = await resolveMappings(input)
      return {
        actionId: input.actionId,
        predictedLessonIds: mappings.map((mapping) => mapping.lesson.id),
      }
    },
    async gap(input) {
      const mappings = await resolveMappings(input)
      const gap = await resolveGap(input)
      return {
        actionId: input.actionId,
        isPredictedGap: mappings.length === 0 || gap !== null,
      }
    },
    async proposer(input: ProposerWriterInput) {
      if (!input.isPredictedGap) {
        return {
          actionId: input.actionId,
          predictedPriority: null,
        }
      }

      const gapInput: GapWriterInput = {
        goalId: input.goalId,
        actionId: input.actionId,
        goldLessonId: null,
        isGap: true,
        predictedLessonIds: [],
        goalText: input.goalText,
        rawAction: input.rawAction as RawEvalAction | undefined,
      }
      const gap = await resolveGap(gapInput)

      if (!gap) {
        return {
          actionId: input.actionId,
          predictedPriority: null,
        }
      }

      const proposal = generateProposals({
        gaps: [gap],
        now: new Date().toISOString(),
      })[0]

      return {
        actionId: input.actionId,
        predictedPriority: proposal?.priority ?? null,
      }
    },
  }
}
