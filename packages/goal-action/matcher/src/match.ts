import {
  ActionLessonMappingSchema,
  MatchActionsInputSchema,
  type ActionLessonMapping,
  type MatchActionsInput,
} from './schema'
import { buildMatchBreakdown, composeMatchScore } from './score'
import { resolveMatchWeights } from './weights'

function compareLessons(
  left: { id: string; source_path: string },
  right: { id: string; source_path: string },
) {
  const idOrder = left.id.localeCompare(right.id, 'en')
  if (idOrder !== 0) {
    return idOrder
  }

  return left.source_path.localeCompare(right.source_path, 'en')
}

function compareMappings(left: ActionLessonMapping, right: ActionLessonMapping) {
  if (left.score !== right.score) {
    return right.score - left.score
  }

  return compareLessons(left.lesson, right.lesson)
}

export function matchActions(input: MatchActionsInput): ActionLessonMapping[] {
  const parsed = MatchActionsInputSchema.parse(input)
  const weights = resolveMatchWeights(parsed.weights)
  const topK = parsed.topK ?? 3
  const lessons = [...parsed.coverageIndex.lessons].sort(compareLessons)
  const mappings: ActionLessonMapping[] = []

  for (const action of parsed.actions) {
    const ranked = lessons
      .map((lesson) => {
        const breakdown = buildMatchBreakdown(action, lesson)

        return ActionLessonMappingSchema.parse({
          action,
          lesson,
          score: composeMatchScore(breakdown, weights),
          breakdown,
          rank: 1,
        })
      })
      .sort(compareMappings)
      .slice(0, topK)
      .map((mapping, index) =>
        ActionLessonMappingSchema.parse({
          ...mapping,
          rank: index + 1,
        }),
      )

    mappings.push(...ranked)
  }

  return mappings
}
