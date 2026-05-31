import {
  MatchWeightsSchema,
  type MatchWeights,
  type MatchWeightsInput,
} from './schema'

function roundUnit(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

export const DEFAULT_MATCH_WEIGHTS = MatchWeightsSchema.parse({
  capability: 0.5,
  prerequisite: 0.2,
  blocker: 0.2,
  evidence: 0.1,
}) as MatchWeights

export function resolveMatchWeights(weights?: MatchWeightsInput): MatchWeights {
  if (!weights) {
    return DEFAULT_MATCH_WEIGHTS
  }

  const merged = {
    ...DEFAULT_MATCH_WEIGHTS,
    ...weights,
  }

  const sum =
    merged.capability +
    merged.prerequisite +
    merged.blocker +
    merged.evidence

  if (sum <= 0) {
    return DEFAULT_MATCH_WEIGHTS
  }

  return MatchWeightsSchema.parse({
    capability: roundUnit(merged.capability / sum),
    prerequisite: roundUnit(merged.prerequisite / sum),
    blocker: roundUnit(merged.blocker / sum),
    evidence: roundUnit(merged.evidence / sum),
  })
}
