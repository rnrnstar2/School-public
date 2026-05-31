import { createHash } from 'node:crypto'
import type {
  ActionBlocker,
  ActionCapability,
  ActionOutcome,
  CanonicalAction,
  NormalizeActionsInput,
  RawAction,
  RawActionObject,
} from './schema'
import {
  CanonicalActionSchema,
  NormalizeActionsInputSchema,
} from './schema'
import { extractStacks } from './stacks'
import {
  BLOCKER_SYNONYMS,
  CAPABILITY_SYNONYMS,
  ORDERED_BLOCKERS,
  ORDERED_CAPABILITIES,
  ORDERED_OUTCOMES,
  OUTCOME_SYNONYMS,
  scoreSynonymMatch,
} from './synonyms'

interface FlattenedAction {
  preferredId?: string
  rawAction: string
  blockerHints: string[]
  stackHints: string[]
}

function flattenRawAction(rawAction: RawAction): FlattenedAction {
  if (typeof rawAction === 'string') {
    return {
      rawAction: rawAction.trim(),
      blockerHints: [],
      stackHints: [],
    }
  }

  const normalizedAction = rawAction as RawActionObject
  const rawText = [
    normalizedAction.text,
    normalizedAction.title,
    normalizedAction.description,
    normalizedAction.outcome,
    normalizedAction.purpose,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' / ')

  return {
    preferredId: normalizedAction.id?.trim() || undefined,
    rawAction: rawText.trim(),
    blockerHints: normalizedAction.blockers?.map((value) => value.trim()).filter(Boolean) ?? [],
    stackHints: normalizedAction.stack?.map((value) => value.trim()).filter(Boolean) ?? [],
  }
}

function detectCapability(actionText: string, goalText: string) {
  const actionMatch = scoreSynonymMatch(actionText, ORDERED_CAPABILITIES, CAPABILITY_SYNONYMS)
  if (actionMatch.score > 0) {
    return actionMatch.key
  }

  const goalMatch = scoreSynonymMatch(goalText, ORDERED_CAPABILITIES, CAPABILITY_SYNONYMS)
  if (goalMatch.score > 0) {
    return goalMatch.key
  }

  return 'plan' as const
}

function defaultOutcomeForCapability(capability: ActionCapability): ActionOutcome {
  switch (capability) {
    case 'research':
    case 'plan':
      return 'clarify_scope'
    case 'setup':
      return 'prepare_foundation'
    case 'build':
      return 'create_asset'
    case 'integrate':
      return 'connect_systems'
    case 'automate':
      return 'automate_process'
    case 'test':
      return 'validate_quality'
    case 'ship':
      return 'publish_release'
    case 'measure':
      return 'measure_performance'
    default:
      return 'clarify_scope'
  }
}

function detectOutcome(actionText: string, goalText: string, capability: ActionCapability) {
  const actionMatch = scoreSynonymMatch(actionText, ORDERED_OUTCOMES, OUTCOME_SYNONYMS)
  if (actionMatch.score > 0) {
    return actionMatch.key
  }

  const goalMatch = scoreSynonymMatch(goalText, ORDERED_OUTCOMES, OUTCOME_SYNONYMS)
  if (goalMatch.score > 0) {
    return goalMatch.key
  }

  return defaultOutcomeForCapability(capability)
}

function detectBlocker(blockerText: string) {
  const blockerMatch = scoreSynonymMatch(blockerText, ORDERED_BLOCKERS, BLOCKER_SYNONYMS)
  if (blockerMatch.score > 0) {
    return blockerMatch.key
  }

  return 'none' as ActionBlocker
}

function buildActionId(flattenedAction: FlattenedAction) {
  if (flattenedAction.preferredId) {
    return flattenedAction.preferredId
  }

  const slug = flattenedAction.rawAction
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9一-龠ぁ-んァ-ヶ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'action'
  const hash = createHash('sha1').update(flattenedAction.rawAction).digest('hex').slice(0, 8)

  return `${slug}-${hash}`
}

function sortActions(actions: readonly CanonicalAction[]) {
  return [...actions].sort((left, right) => {
    const capabilityOrder = left.capability.localeCompare(right.capability, 'en')
    if (capabilityOrder !== 0) {
      return capabilityOrder
    }

    const outcomeOrder = left.outcome.localeCompare(right.outcome, 'en')
    if (outcomeOrder !== 0) {
      return outcomeOrder
    }

    return left.actionId.localeCompare(right.actionId, 'en')
  })
}

export function normalizeActions(input: NormalizeActionsInput): CanonicalAction[] {
  const strategy = input.strategy ?? 'dictionary'
  if (strategy !== 'dictionary') {
    throw new Error(`Unknown normalization strategy: ${String(strategy)}`)
  }

  const parsed = NormalizeActionsInputSchema.parse({
    ...input,
    strategy,
  })

  const goalText = parsed.goal.trim()
  const actions = parsed.rawActions.map((rawAction) => {
    const flattenedAction = flattenRawAction(rawAction)
    const capability = detectCapability(flattenedAction.rawAction, goalText)
    const outcome = detectOutcome(flattenedAction.rawAction, goalText, capability)
    const blocker = detectBlocker([
      flattenedAction.rawAction,
      ...flattenedAction.blockerHints,
    ].join(' '))

    return CanonicalActionSchema.parse({
      actionId: buildActionId(flattenedAction),
      rawAction: flattenedAction.rawAction,
      capability,
      outcome,
      blocker,
      context: {
        stack: extractStacks([
          goalText,
          flattenedAction.rawAction,
          ...flattenedAction.stackHints,
        ]),
      },
    })
  })

  return sortActions(actions)
}
