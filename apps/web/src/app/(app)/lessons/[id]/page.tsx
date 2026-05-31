import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AtomDetailView } from '@/components/atoms/atom-detail-view'
import { fetchAtomById, fetchAtomsByIds } from '@/lib/atoms/atom-repository'
import { getLearnerProfile } from '@/lib/learner-models'
import { createClient } from '@/lib/supabase/server'
import { toAtomViewModel, type AtomViewModel } from '@/lib/atoms/atom-view-model'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type LessonPageSupabaseClient = SupabaseClient<Database>
const EMPTY_LEARNER_CONTEXT = {
  learnerBlockers: undefined,
  recentFeedback: undefined,
}

async function fetchLessonLearnerContext(client: LessonPageSupabaseClient) {
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return EMPTY_LEARNER_CONTEXT
  }

  const [learnerStateResult, recentFeedbackResult] = await Promise.all([
    client
      .from('learner_state')
      .select('blockers')
      .eq('user_id', user.id)
      .maybeSingle(),
    client
      .from('lesson_feedback')
      .select('comment')
      .eq('user_id', user.id)
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return {
    learnerBlockers:
      ((learnerStateResult.data as { blockers?: string[] | null } | null)?.blockers ?? undefined) ??
      undefined,
    recentFeedback:
      ((recentFeedbackResult.data as { comment?: string | null } | null)?.comment ?? undefined) ??
      undefined,
  }
}

function buildAtomDescription(atom: AtomViewModel) {
  const capabilityText = atom.capabilityOutputs.join(' / ')

  if (capabilityText) {
    return `${atom.title} | ${capabilityText}`
  }

  return atom.summary
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const atomId = id.trim()

  try {
    const atom = atomId ? await fetchAtomById(atomId) : null

    if (atom) {
      const atomViewModel = toAtomViewModel(atom)
      const description = buildAtomDescription(atomViewModel)

      return {
        title: atomViewModel.title,
        description,
        openGraph: {
          title: `${atomViewModel.title} | School`,
          description,
          type: 'article',
          locale: 'ja_JP',
          siteName: 'School',
        },
        twitter: {
          card: 'summary_large_image',
          title: `${atomViewModel.title} | School`,
          description,
        },
      }
    }
  } catch {
    // Fall through to default metadata
  }

  return {
    title: 'レッスン詳細',
    description: 'School のレッスン詳細ページです。',
  }
}

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { id } = await params
  const atomId = id.trim()

  if (!atomId) {
    notFound()
  }

  const [atom, learnerContext, learnerProfileResult] = await Promise.all([
    fetchAtomById(atomId),
    fetchLessonLearnerContext(supabase).catch(() => EMPTY_LEARNER_CONTEXT),
    getLearnerProfile(supabase),
  ])

  if (!atom) {
    notFound()
  }

  const atomViewModel = toAtomViewModel(atom)
  const prerequisiteIds = Array.from(
    new Set([...atomViewModel.hardPrerequisites, ...atomViewModel.softPrerequisites]),
  )
  // Single round-trip batch load (replaces previous per-prerequisite N+1).
  const prerequisiteAtoms = await fetchAtomsByIds(prerequisiteIds)
  const prerequisiteViewModels = prerequisiteAtoms
    .map((prerequisiteAtom) => toAtomViewModel(prerequisiteAtom))
    .sort((left, right) => left.title.localeCompare(right.title, 'ja'))

  return (
    <AtomDetailView
      atom={atomViewModel}
      prerequisites={prerequisiteViewModels}
      learnerProfile={learnerProfileResult.data ?? null}
      learnerBlockers={learnerContext.learnerBlockers}
      recentFeedback={learnerContext.recentFeedback}
    />
  )
}
