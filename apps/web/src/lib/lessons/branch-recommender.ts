import type { LearnerProfile } from '@/types'

export interface RecommendableBranch {
  lessonId: string
  branchLabel?: string | null
}

export interface BranchRecommendation {
  recommendedLessonId: string | null
  reason: string | null
}

interface BranchScore {
  lessonId: string
  score: number
  reason: string
}

const EMPTY_RECOMMENDATION: BranchRecommendation = {
  recommendedLessonId: null,
  reason: null,
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function detectOsFamily(operatingSystem: string | null | undefined) {
  const normalized = normalize(operatingSystem)

  if (!normalized) {
    return null
  }

  if (normalized.includes('windows')) {
    return 'windows'
  }

  if (normalized.includes('mac') || normalized.includes('linux')) {
    return 'unix'
  }

  return null
}

function resolveOsReasonLabel(operatingSystem: string | null | undefined) {
  const normalized = normalize(operatingSystem)

  if (normalized.includes('windows')) {
    return 'Windows'
  }

  if (normalized.includes('linux')) {
    return 'Linux'
  }

  if (normalized.includes('mac')) {
    return 'macOS'
  }

  return operatingSystem?.trim() || 'この環境'
}

function hasUnixLabel(label: string) {
  return label.includes('macos') || label.includes('mac') || label.includes('linux')
}

function hasWindowsLabel(label: string) {
  return label.includes('windows') || label.includes('win')
}

function hasCliLabel(label: string) {
  return label.includes('cli') || label.includes('コマンド')
}

function hasNonCliLabel(label: string) {
  return (
    label.includes('cli を使わない') ||
    label.includes('cliなし') ||
    label.includes('コマンドを使わない') ||
    label.includes('コマンドなし')
  )
}

function buildReason(params: {
  operatingSystem: string | null | undefined
  cliFamiliarity: LearnerProfile['cli_familiarity']
  osMatched: boolean
  cliMatched: boolean
  nonCliMatched: boolean
}) {
  if (params.osMatched && params.cliMatched && params.cliFamiliarity) {
    return `${resolveOsReasonLabel(params.operatingSystem)} + CLI ${params.cliFamiliarity} なあなたに合っています`
  }

  if (params.osMatched) {
    return `${resolveOsReasonLabel(params.operatingSystem)} 環境のあなたに合っています`
  }

  if (params.cliMatched && params.cliFamiliarity) {
    return `CLI ${params.cliFamiliarity} なあなたに合っています`
  }

  if (params.nonCliMatched) {
    return 'CLI なしで進めたいあなたに合っています'
  }

  return null
}

function scoreBranch(params: {
  branch: RecommendableBranch
  profile: LearnerProfile
}): BranchScore | null {
  const label = normalize(params.branch.branchLabel)

  if (!label) {
    return null
  }

  const osFamily = detectOsFamily(params.profile.operating_system)
  const cliFamiliarity = params.profile.cli_familiarity
  const osMatched =
    (osFamily === 'unix' && hasUnixLabel(label)) ||
    (osFamily === 'windows' && hasWindowsLabel(label))
  const cliMatched = cliFamiliarity !== null && cliFamiliarity !== 'none' && hasCliLabel(label)
  const nonCliMatched = cliFamiliarity === 'none' && hasNonCliLabel(label)
  const score = osMatched && cliMatched ? 3 : osMatched ? 2 : cliMatched || nonCliMatched ? 1 : 0

  if (score === 0) {
    return null
  }

  const reason = buildReason({
    operatingSystem: params.profile.operating_system,
    cliFamiliarity,
    osMatched,
    cliMatched,
    nonCliMatched,
  })

  if (!reason) {
    return null
  }

  return {
    lessonId: params.branch.lessonId,
    score,
    reason,
  }
}

export function recommendBranch(params: {
  branches: RecommendableBranch[]
  profile: LearnerProfile | null | undefined
}): BranchRecommendation {
  if (!params.profile || params.branches.length < 2) {
    return EMPTY_RECOMMENDATION
  }

  let bestMatch: BranchScore | null = null

  for (const branch of params.branches) {
    const scored = scoreBranch({ branch, profile: params.profile })

    if (!scored) {
      continue
    }

    if (!bestMatch || scored.score > bestMatch.score) {
      bestMatch = scored
    }
  }

  if (!bestMatch) {
    return EMPTY_RECOMMENDATION
  }

  return {
    recommendedLessonId: bestMatch.lessonId,
    reason: bestMatch.reason,
  }
}
