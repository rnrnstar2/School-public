import type {
  ImprovementCompiledPlan,
  ImprovementCurrentAtomVersion,
  ImprovementFindingDraft,
  ImprovementTelemetryEvent,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000

function asDate(value: string): Date {
  return new Date(value)
}

function toSeverity(score: number, mediumThreshold: number, highThreshold: number) {
  if (score >= highThreshold) {
    return 'high' as const
  }

  if (score >= mediumThreshold) {
    return 'medium' as const
  }

  return 'low' as const
}

export function mineConfusionFindings(
  events: ImprovementTelemetryEvent[],
): ImprovementFindingDraft[] {
  const stats = new Map<string, { stuck: number; skipped: number }>()

  for (const event of events) {
    if (!event.atom_id) {
      continue
    }

    const current = stats.get(event.atom_id) ?? { stuck: 0, skipped: 0 }
    if (event.event_name === 'stuck_reported') {
      current.stuck += 1
    } else if (event.event_name === 'lesson_skipped') {
      current.skipped += 1
    }
    stats.set(event.atom_id, current)
  }

  const findings: ImprovementFindingDraft[] = []
  for (const [atomId, counts] of stats.entries()) {
    const total = counts.stuck + counts.skipped
    if (counts.stuck < 3 && counts.skipped < 4 && total < 5) {
      continue
    }

    findings.push({
        finding_type: 'confusion' as const,
        atom_id: atomId,
        persona_id: null,
        capability: null,
        severity: toSeverity(Math.max(counts.stuck, total), 3, 5),
        evidence: {
          stuck_count: counts.stuck,
          skipped_count: counts.skipped,
          total_count: total,
          lookback_hours: 24,
          recommendation: 'Improve the existing atom explanation and checkpoint design.',
        },
      })
  }

  return findings.sort((left, right) => {
    const atomCompare = String(left.atom_id).localeCompare(String(right.atom_id))
    return atomCompare !== 0 ? atomCompare : left.severity.localeCompare(right.severity)
  })
}

export function mineFreshnessFindings({
  currentVersions,
  telemetryEvents,
  now = new Date(),
}: {
  currentVersions: ImprovementCurrentAtomVersion[]
  telemetryEvents: ImprovementTelemetryEvent[]
  now?: Date
}): ImprovementFindingDraft[] {
  const recentStart = new Date(now.getTime() - 7 * DAY_MS)
  const baselineStart = new Date(now.getTime() - 14 * DAY_MS)
  const telemetryByAtom = new Map<
    string,
    {
      recentAttempts: number
      recentPasses: number
      baselineAttempts: number
      baselinePasses: number
    }
  >()

  for (const event of telemetryEvents) {
    if (!event.atom_id) {
      continue
    }

    const current = telemetryByAtom.get(event.atom_id) ?? {
      recentAttempts: 0,
      recentPasses: 0,
      baselineAttempts: 0,
      baselinePasses: 0,
    }
    const occurredAt = asDate(event.occurred_at)
    const isRecent = occurredAt >= recentStart
    const isBaseline = occurredAt >= baselineStart && occurredAt < recentStart

    if (!isRecent && !isBaseline) {
      continue
    }

    if (event.event_name === 'artifact_submitted') {
      if (isRecent) current.recentAttempts += 1
      if (isBaseline) current.baselineAttempts += 1
    }

    if (event.event_name === 'evidence_passed') {
      if (isRecent) current.recentPasses += 1
      if (isBaseline) current.baselinePasses += 1
    }

    telemetryByAtom.set(event.atom_id, current)
  }

  const findings: ImprovementFindingDraft[] = []
  for (const version of currentVersions) {
    const importedAt = asDate(version.imported_at)
    const ageDays = Math.floor((now.getTime() - importedAt.getTime()) / DAY_MS)
    if (ageDays < 90) {
      continue
    }

    const stats = telemetryByAtom.get(version.atom_id)
    if (!stats || stats.recentAttempts < 2 || stats.baselineAttempts < 2) {
      continue
    }

    const recentRate = stats.recentPasses / stats.recentAttempts
    const baselineRate = stats.baselinePasses / stats.baselineAttempts
    const drop = baselineRate - recentRate

    if (drop < 0.2 || recentRate >= baselineRate) {
      continue
    }

    findings.push({
        finding_type: 'freshness' as const,
        atom_id: version.atom_id,
        persona_id: null,
        capability: null,
        severity: toSeverity(drop, 0.2, 0.35),
        evidence: {
          atom_version_id: version.version_id,
          imported_at: version.imported_at,
          age_days: ageDays,
          recent_attempts: stats.recentAttempts,
          recent_passes: stats.recentPasses,
          recent_pass_rate: Number(recentRate.toFixed(3)),
          baseline_attempts: stats.baselineAttempts,
          baseline_passes: stats.baselinePasses,
          baseline_pass_rate: Number(baselineRate.toFixed(3)),
          pass_rate_drop: Number(drop.toFixed(3)),
          recommendation: 'Refresh the atom evidence criteria and examples without auto-editing lessons.',
        },
      })
  }

  return findings.sort((left, right) => String(left.atom_id).localeCompare(String(right.atom_id)))
}

export function mineGapFindings(
  plans: ImprovementCompiledPlan[],
): ImprovementFindingDraft[] {
  const stats = new Map<
    string,
    {
      count: number
      personas: Map<string, number>
      planIds: string[]
    }
  >()

  for (const plan of plans) {
    for (const capability of plan.unsupported_capabilities) {
      const current = stats.get(capability) ?? {
        count: 0,
        personas: new Map<string, number>(),
        planIds: [],
      }
      current.count += 1
      if (plan.persona_id) {
        current.personas.set(
          plan.persona_id,
          (current.personas.get(plan.persona_id) ?? 0) + 1,
        )
      }
      current.planIds.push(plan.plan_id)
      stats.set(capability, current)
    }
  }

  const findings: ImprovementFindingDraft[] = []
  for (const [capability, entry] of stats.entries()) {
    if (entry.count < 3) {
      continue
    }

    const topPersona = Array.from(entry.personas.entries())
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null

    findings.push({
        finding_type: 'gap' as const,
        atom_id: null,
        persona_id: topPersona,
        capability,
        severity: toSeverity(entry.count, 3, 6),
        evidence: {
          occurrence_count: entry.count,
          top_persona_id: topPersona,
          persona_counts: Object.fromEntries(entry.personas),
          sample_plan_ids: entry.planIds.slice(0, 5),
          lookback_days: 30,
          recommendation: topPersona
            ? 'Consider a new atom and persona refinement proposal.'
            : 'Consider a new atom proposal for this unsupported capability.',
        },
      })
  }

  return findings.sort((left, right) => String(left.capability).localeCompare(String(right.capability)))
}
