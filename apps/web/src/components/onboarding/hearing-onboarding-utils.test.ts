import { describe, it, expect } from 'vitest'
import {
  buildHearingPlanDraft,
  coerceHearingSession,
} from './hearing-onboarding-utils'
import type { PlannerHearingSession } from '@/lib/planner/types'

const BASE_TRANSPORT = {
  status: 'live' as const,
  label: 'ZAI coding plan',
  message: 'live',
}

function createSession(overrides: Partial<PlannerHearingSession> & { personaIds?: string[] } = {}) {
  return {
    answers: {
      purpose: '採用担当に見せるポートフォリオを作りたい',
      ...(overrides.answers ?? {}),
    },
    insights: overrides.insights ?? null,
    messages: overrides.messages ?? [],
    lastQuestionId: overrides.lastQuestionId ?? null,
    transport: overrides.transport ?? BASE_TRANSPORT,
    completedAt: overrides.completedAt ?? null,
    ...(overrides.personaIds ? { personaIds: overrides.personaIds } : {}),
  } as PlannerHearingSession & { personaIds?: string[] }
}

describe('derivePersonaIds (via buildHearingPlanDraft)', () => {
  it('uses AI-extracted personaIds when present', () => {
    const session = createSession({ personaIds: ['persona.ai-content-creator'] })
    const draft = buildHearingPlanDraft('AIで記事を量産したい', session)
    expect(draft.compileRequest.personaIds).toEqual(['persona.ai-content-creator'])
    expect(draft.summary.personaIds).toEqual(['persona.ai-content-creator'])
    expect(draft.summary.personaLabels).toEqual(['AIコンテンツ制作'])
  })

  it('falls back to regex-derived web-builder persona when AI personaIds are absent', () => {
    const session = createSession({
      answers: { purpose: 'ポートフォリオサイトを作りたい' },
    })
    const draft = buildHearingPlanDraft('ポートフォリオサイトを作りたい', session)
    expect(draft.compileRequest.personaIds).toEqual(['persona.web-builder'])
  })

  it('returns [] when neither AI personaIds nor web-signals match', () => {
    const session = createSession({
      answers: { purpose: '何か作りたい' },
    })
    const draft = buildHearingPlanDraft('何か作りたい', session)
    expect(draft.compileRequest.personaIds).toBeUndefined()
    expect(draft.summary.personaIds).toEqual([])
  })

  it('filters out unsupported persona ids from AI output', () => {
    const session = createSession({ personaIds: ['persona.bogus', 'persona.ai-app-builder'] })
    const draft = buildHearingPlanDraft('AIで業務ツールを作りたい', session)
    expect(draft.compileRequest.personaIds).toEqual(['persona.ai-app-builder'])
  })

  it('accepts up to two persona ids', () => {
    const session = createSession({
      personaIds: ['persona.web-builder', 'persona.ai-content-creator', 'persona.ai-app-builder'],
    })
    const draft = buildHearingPlanDraft('幅広く作りたい', session)
    expect(draft.compileRequest.personaIds).toEqual([
      'persona.web-builder',
      'persona.ai-content-creator',
    ])
  })
})

describe('coerceHearingSession personaIds passthrough', () => {
  it('preserves supported personaIds', () => {
    const session = coerceHearingSession({
      answers: { purpose: 'AIコンテンツを作る' },
      personaIds: ['persona.ai-content-creator', 'persona.ai-content-creator'],
    }) as (PlannerHearingSession & { personaIds?: string[] }) | null
    expect(session?.personaIds).toEqual(['persona.ai-content-creator'])
  })

  it('drops unsupported personaIds entirely', () => {
    const session = coerceHearingSession({
      answers: { purpose: 'AIコンテンツを作る' },
      personaIds: ['persona.unknown'],
    }) as (PlannerHearingSession & { personaIds?: string[] }) | null
    expect(session?.personaIds).toBeUndefined()
  })

  // W67 (Wave 14): persona.noneng-webapp は SUPPORTED_PERSONA_IDS に含まれる
  // ようになったため、live-hearing path / coerceHearingSession で drop されない
  // ことを契約化する。
  it('preserves persona.noneng-webapp (W67)', () => {
    const session = coerceHearingSession({
      answers: { purpose: '非エンジニアだけど Web アプリを公開したい' },
      personaIds: ['persona.noneng-webapp'],
    }) as (PlannerHearingSession & { personaIds?: string[] }) | null
    expect(session?.personaIds).toEqual(['persona.noneng-webapp'])
  })
})
