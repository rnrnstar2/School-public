export {
  ActionLessonMappingSchema,
  MatchActionsInputSchema,
  MatchScoreSchema,
  MatchWeightsInputSchema,
  MatchWeightsSchema,
  type ActionLessonMapping,
  type MatchActionsInput,
  type MatchScore,
  type MatchWeights,
  type MatchWeightsInput,
} from './schema'
export { matchActions } from './match'
export {
  buildMatchBreakdown,
  composeMatchScore,
  scoreBlocker,
  scoreCapability,
  scoreEvidence,
  scorePrerequisite,
} from './score'
export { DEFAULT_MATCH_WEIGHTS, resolveMatchWeights } from './weights'
