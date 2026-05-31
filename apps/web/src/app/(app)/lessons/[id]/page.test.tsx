import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  mockFetchAtomById,
  mockFetchAtomsByIds,
  mockCreateClient,
  mockGetLearnerProfile,
  mockNotFound,
} = vi.hoisted(() => ({
  mockFetchAtomById: vi.fn(),
  mockFetchAtomsByIds: vi.fn(),
  mockCreateClient: vi.fn(),
  mockGetLearnerProfile: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchAtomById: mockFetchAtomById,
  fetchAtomsByIds: mockFetchAtomsByIds,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/learner-models', () => ({
  getLearnerProfile: mockGetLearnerProfile,
}))

vi.mock('@/components/atoms/atom-detail-view', () => ({
  AtomDetailView: ({
    atom,
    prerequisites,
    learnerProfile,
    learnerBlockers,
    recentFeedback,
  }: {
    atom: { atomId: string; title: string }
    prerequisites: Array<{ atomId: string }>
    learnerProfile?: { operating_system?: string | null } | null
    learnerBlockers?: string[]
    recentFeedback?: string | null
  }) => (
    <div>
      <div>{`atom:${atom.atomId}`}</div>
      <div>{`title:${atom.title}`}</div>
      <div>{`prerequisites:${prerequisites.map((prerequisite) => prerequisite.atomId).join(',')}`}</div>
      <div>{`profile:${learnerProfile?.operating_system ?? ''}`}</div>
      <div>{`blockers:${learnerBlockers?.join(',') ?? ''}`}</div>
      <div>{`feedback:${recentFeedback ?? ''}`}</div>
    </div>
  ),
}))

import LessonDetailPage, { generateMetadata } from './page'

function createSupabaseMock({
  userId = 'user-1',
  getUser = async () => ({
    data: {
      user: userId ? { id: userId } : null,
    },
  }),
  learnerStateMaybeSingle = async () => ({ data: null }),
  feedbackMaybeSingle = async () => ({ data: null }),
}: {
  userId?: string | null
  getUser?: () => Promise<{ data: { user: { id: string } | null } }>
  learnerStateMaybeSingle?: () => Promise<{ data: unknown }>
  feedbackMaybeSingle?: () => Promise<{ data: unknown }>
}) {
  const learnerStateBuilder = {
    select: vi.fn(() => learnerStateBuilder),
    eq: vi.fn(() => learnerStateBuilder),
    maybeSingle: vi.fn(() => learnerStateMaybeSingle()),
  }
  const feedbackBuilder = {
    select: vi.fn(() => feedbackBuilder),
    eq: vi.fn(() => feedbackBuilder),
    not: vi.fn(() => feedbackBuilder),
    order: vi.fn(() => feedbackBuilder),
    limit: vi.fn(() => feedbackBuilder),
    maybeSingle: vi.fn(() => feedbackMaybeSingle()),
  }

  return {
    auth: {
      getUser: vi.fn(() => getUser()),
    },
    from: vi.fn((table: string) => {
      if (table === 'learner_state') {
        return learnerStateBuilder
      }

      if (table === 'lesson_feedback') {
        return feedbackBuilder
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('LessonDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLearnerProfile.mockResolvedValue({
      data: {
        user_id: 'user-1',
        display_name: 'Test User',
        locale: 'ja',
        experience_summary: null,
        operating_system: 'macOS',
        cli_familiarity: 'comfortable',
        available_ai_tools: [],
        can_use_local_tools: true,
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
      },
      error: null,
    })
    mockFetchAtomsByIds.mockImplementation(async (atomIds: string[]) => {
      const results = await Promise.all(atomIds.map((id) => mockFetchAtomById(id)))
      return results.filter(Boolean)
    })
    mockFetchAtomById.mockImplementation(async (atomId: string) => {
      if (atomId === 'atom.web-builder.create-next-app') {
        return {
          atomId,
          versionId: 'version-1',
          status: 'stable',
          yamlContent: {},
          bodyMarkdown: '## なぜこのレッスン\n理由です。',
          metadata: {},
          title: 'Next.js の初期アプリを作る',
          personaTags: ['web-builder'],
          goalTags: ['build-ui'],
          capabilityInputs: [],
          capabilityOutputs: ['next-app-ready', 'local-dev-ready'],
          hardPrerequisites: ['atom.web-builder.choose-project-goal'],
          softPrerequisites: ['atom.web-builder.optional-note'],
          estimatedMinutes: 25,
          deliverable: { type: 'config_file', validation: 'basic_manual_check_v1' },
          evidence: ['code_diff'],
          mediaSlots: ['screen_capture'],
        }
      }

      if (atomId === 'atom.web-builder.choose-project-goal') {
        return {
          atomId,
          versionId: 'version-2',
          status: 'draft',
          yamlContent: {},
          bodyMarkdown: '本文',
          metadata: {},
          title: '作りたいサイトの目的を決める',
          personaTags: ['web-builder'],
          goalTags: ['website-launch'],
          capabilityInputs: [],
          capabilityOutputs: ['goal-ready'],
          hardPrerequisites: [],
          softPrerequisites: [],
          estimatedMinutes: 15,
          deliverable: { type: 'markdown_doc', validation: 'basic_manual_check_v1' },
          evidence: ['screenshot'],
          mediaSlots: ['screen_capture'],
        }
      }

      return null
    })
    mockCreateClient.mockResolvedValue(createSupabaseMock({}))
  })

  it('renders atom detail, prerequisites, and learner context', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseMock({
        learnerStateMaybeSingle: async () => ({
          data: { blockers: ['環境構築で止まった'] },
        }),
        feedbackMaybeSingle: async () => ({
          data: { comment: '次の一手が曖昧だった' },
        }),
      }),
    )

    const page = await LessonDetailPage({
      params: Promise.resolve({ id: 'atom.web-builder.create-next-app' }),
    })

    render(page)

    expect(screen.getByText('atom:atom.web-builder.create-next-app')).toBeInTheDocument()
    expect(screen.getByText('title:Next.js の初期アプリを作る')).toBeInTheDocument()
    expect(screen.getByText('prerequisites:atom.web-builder.choose-project-goal')).toBeInTheDocument()
    expect(screen.getByText('profile:macOS')).toBeInTheDocument()
    expect(screen.getByText('blockers:環境構築で止まった')).toBeInTheDocument()
    expect(screen.getByText('feedback:次の一手が曖昧だった')).toBeInTheDocument()
  })

  it('renders lesson content when learner context fetching rejects', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseMock({
        getUser: async () => {
          throw new Error('auth unavailable')
        },
      }),
    )

    const page = await LessonDetailPage({
      params: Promise.resolve({ id: 'atom.web-builder.create-next-app' }),
    })

    render(page)

    expect(screen.getByText('atom:atom.web-builder.create-next-app')).toBeInTheDocument()
    expect(screen.getByText('title:Next.js の初期アプリを作る')).toBeInTheDocument()
    expect(screen.getByText('prerequisites:atom.web-builder.choose-project-goal')).toBeInTheDocument()
    expect(screen.getByText('profile:macOS')).toBeInTheDocument()
    expect(screen.getByText('blockers:')).toBeInTheDocument()
    expect(screen.getByText('feedback:')).toBeInTheDocument()
  })

  it('builds metadata from atom title and capability outputs', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'atom.web-builder.create-next-app' }),
    })

    expect(metadata.title).toBe('Next.js の初期アプリを作る')
    expect(metadata.description).toBe('Next.js の初期アプリを作る | next-app-ready / local-dev-ready')
  })

  it('calls notFound when the atom does not exist', async () => {
    await expect(
      LessonDetailPage({
        params: Promise.resolve({ id: 'atom.web-builder.unknown' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('starts learner-state and learner-profile fetching in parallel with the atom fetch', async () => {
    const callOrder: string[] = []
    let resolveAtom: ((value: unknown) => void) | undefined
    let resolveLearnerState: ((value: { data: unknown }) => void) | undefined
    let resolveLearnerProfile:
      | ((value: {
          data: {
            user_id: string
            display_name: string | null
            locale: string
            experience_summary: string | null
            operating_system: string | null
            cli_familiarity: 'comfortable'
            available_ai_tools: string[]
            can_use_local_tools: boolean | null
            created_at: string
            updated_at: string
          }
          error: null
        }) => void)
      | undefined

    mockFetchAtomById.mockImplementation(async (atomId: string) => {
      if (atomId === 'atom.web-builder.create-next-app') {
        callOrder.push('atom')
        return await new Promise((resolve) => {
          resolveAtom = resolve
        })
      }

      return {
        atomId,
        versionId: 'version-2',
        status: 'draft',
        yamlContent: {},
        bodyMarkdown: '本文',
        metadata: {},
        title: '作りたいサイトの目的を決める',
        personaTags: ['web-builder'],
        goalTags: ['website-launch'],
        capabilityInputs: [],
        capabilityOutputs: ['goal-ready'],
        hardPrerequisites: [],
        softPrerequisites: [],
        estimatedMinutes: 15,
        deliverable: { type: 'markdown_doc', validation: 'basic_manual_check_v1' },
        evidence: ['screenshot'],
        mediaSlots: ['screen_capture'],
      }
    })

    mockCreateClient.mockResolvedValue(
      createSupabaseMock({
        learnerStateMaybeSingle: async () => {
          callOrder.push('learner_state')
          return await new Promise((resolve) => {
            resolveLearnerState = resolve
          })
        },
      }),
    )
    mockGetLearnerProfile.mockImplementation(async () => {
      callOrder.push('learner_profile')
      return await new Promise((resolve) => {
        resolveLearnerProfile = resolve
      })
    })

    const pagePromise = LessonDetailPage({
      params: Promise.resolve({ id: 'atom.web-builder.create-next-app' }),
    })

    await vi.waitFor(() => {
      expect(callOrder).toEqual(['atom', 'learner_profile', 'learner_state'])
    })

    resolveLearnerState?.({ data: { blockers: ['環境構築で止まった'] } })
    resolveLearnerProfile?.({
      data: {
        user_id: 'user-1',
        display_name: 'Test User',
        locale: 'ja',
        experience_summary: null,
        operating_system: 'macOS',
        cli_familiarity: 'comfortable',
        available_ai_tools: [],
        can_use_local_tools: true,
        created_at: '2026-04-18T00:00:00.000Z',
        updated_at: '2026-04-18T00:00:00.000Z',
      },
      error: null,
    })
    resolveAtom?.({
      atomId: 'atom.web-builder.create-next-app',
      versionId: 'version-1',
      status: 'stable',
      yamlContent: {},
      bodyMarkdown: '## なぜこのレッスン\n理由です。',
      metadata: {},
      title: 'Next.js の初期アプリを作る',
      personaTags: ['web-builder'],
      goalTags: ['build-ui'],
      capabilityInputs: [],
      capabilityOutputs: ['next-app-ready', 'local-dev-ready'],
      hardPrerequisites: ['atom.web-builder.choose-project-goal'],
      softPrerequisites: ['atom.web-builder.optional-note'],
      estimatedMinutes: 25,
      deliverable: { type: 'config_file', validation: 'basic_manual_check_v1' },
      evidence: ['code_diff'],
      mediaSlots: ['screen_capture'],
    })

    await expect(pagePromise).resolves.toBeTruthy()
  })
})
