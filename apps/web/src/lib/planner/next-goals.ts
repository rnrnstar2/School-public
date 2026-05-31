import { classifyGoalDomains, normalizeGoal } from '@/lib/planner/goal-first'
import type { Capability, Domain } from '@/types/domain'

export interface NextGoalSuggestion {
  id: string
  goal: string
  description: string
  trackId: string
  trackLabel: string
  type: 'same-track' | 'cross-track'
  domainSlug?: string
  capabilityLabels?: string[]
}

export function resolveTargetDomains(params: {
  domains: Domain[]
  activeGoalOutcome: string | null
  activeGoalDomainIds: string[]
  fallbackTrackId: string | null
  goalSummary: string | null
}) {
  const { domains, activeGoalOutcome, activeGoalDomainIds, fallbackTrackId, goalSummary } = params

  const domainById = new Map<string, Domain>(domains.map((domain) => [domain.id, domain]))
  const domainBySlug = new Map<string, Domain>(domains.map((domain) => [domain.slug, domain]))

  const explicitDomains = activeGoalDomainIds
    .map((domainId) => domainById.get(domainId))
    .filter((domain): domain is Domain => Boolean(domain))

  if (explicitDomains.length > 0) {
    return explicitDomains
  }

  const goalText = activeGoalOutcome?.trim() || goalSummary?.trim() || fallbackTrackId?.trim() || ''
  if (goalText) {
    const normalized = normalizeGoal(goalText)
    const classification = classifyGoalDomains(normalized)
    const classifiedDomains = classification.domains
      .map((domainScore) => domainBySlug.get(domainScore.slug))
      .filter((domain): domain is Domain => Boolean(domain))

    if (classifiedDomains.length > 0) {
      return classifiedDomains
    }
  }

  if (fallbackTrackId && domainBySlug.has(fallbackTrackId)) {
    return [domainBySlug.get(fallbackTrackId)!]
  }

  return domains
}

export function buildSuggestionForDomain(params: {
  domain: Domain
  capabilities: Capability[]
  assessedMap: Map<string, number>
  currentTrackId: string | null
  index: number
}): NextGoalSuggestion | null {
  const { domain, capabilities, assessedMap, currentTrackId, index } = params
  const unmasteredCaps = capabilities
    .filter((cap) => {
      const score = assessedMap.get(cap.id)
      return score === undefined || score < 70
    })
    .sort((left, right) => {
      const leftScore = assessedMap.get(left.id) ?? 0
      const rightScore = assessedMap.get(right.id) ?? 0
      if (leftScore !== rightScore) return leftScore - rightScore
      return left.label.localeCompare(right.label, 'ja')
    })

  if (unmasteredCaps.length === 0) {
    return null
  }

  const capabilityLabels = unmasteredCaps.slice(0, 3).map((cap) => cap.label)
  const goalText = `${domain.label}の${capabilityLabels.join('・')}を伸ばしたい`
  const description = `${domain.label}領域の未習得能力 ${unmasteredCaps.length} 件を補強します`

  return {
    id: `next-${domain.slug}-${index}`,
    goal: goalText,
    description,
    trackId: domain.slug,
    trackLabel: domain.label,
    type: currentTrackId === domain.slug ? 'same-track' : 'cross-track',
    domainSlug: domain.slug,
    capabilityLabels,
  }
}
