'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowLeft, Clock3, Lightbulb, Lock } from 'lucide-react'
import { AtomBodyRenderer } from '@/components/atoms/atom-body-renderer'
import { Card, CardContent, CardHeader, CardTitle } from '@school/ui/card'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { LessonCompleteButton } from '@/components/lesson/lesson-complete-button'
import {
  DELIVERABLE_GLOSSARY,
  EVIDENCE_GLOSSARY,
  describeCapability,
} from '@/lib/atoms/capability-glossary'
import { useCompletedLessonIds } from '@/hooks/use-completed-lesson-ids'
import { LessonStartedTracker } from '@/components/analytics/lesson-started-tracker'
import type { AtomViewModel } from '@/lib/atoms/atom-view-model'
import type { LearnerProfile } from '@/types'

function renderMetaBadges(values: string[], fallback: string) {
  return (
    <div className="flex flex-wrap gap-2">
      {(values.length > 0 ? values : [fallback]).map((value) => (
        <span
          key={value}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {value}
        </span>
      ))}
    </div>
  )
}

type PrerequisiteStrength = 'hard' | 'soft'

function PrerequisiteList({
  title,
  atomIds,
  prerequisitesById,
  strength,
}: {
  title: string
  atomIds: string[]
  prerequisitesById: Map<string, AtomViewModel>
  strength: PrerequisiteStrength
}) {
  if (atomIds.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">なし</p>
      </div>
    )
  }

  const isHard = strength === 'hard'
  const badgeLabel = isHard ? '必須' : 'おすすめ'
  const badgeClass = isHard
    ? 'inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200'
    : 'inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200'
  // Hard prereqs keep the existing orange "required" accent; soft prereqs
  // are visually muted (sky-tinted) so learners can tell them apart at a
  // glance without mistaking a recommendation for a gate.
  const linkClass = isHard
    ? 'flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition hover:border-orange-300 hover:bg-orange-50/60 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-orange-400/40 dark:hover:bg-orange-500/5'
    : 'flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50/70 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-sky-400/40 dark:hover:bg-sky-500/5'
  const openLabelClass = isHard
    ? 'text-xs text-orange-700 dark:text-orange-200'
    : 'text-xs text-sky-700 dark:text-sky-200'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <span className={badgeClass}>
          {isHard ? <Lock className="h-3 w-3" aria-hidden="true" /> : <Lightbulb className="h-3 w-3" aria-hidden="true" />}
          {badgeLabel}
        </span>
      </div>
      <div className="space-y-2">
        {atomIds.map((atomId) => {
          const prerequisite = prerequisitesById.get(atomId)

          if (!prerequisite) {
            return (
              <div
                key={atomId}
                aria-disabled="true"
                className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
              >
                {atomId}（未掲載）
              </div>
            )
          }

          return (
            <Link
              key={atomId}
              href={`/lessons/${prerequisite.atomId}`}
              className={linkClass}
              aria-label={`${badgeLabel}前提レッスン: ${prerequisite.title}`}
            >
              <span>
                <span className="block font-medium text-slate-900 dark:text-slate-100">{prerequisite.title}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{prerequisite.atomId}</span>
              </span>
              <span className={openLabelClass}>開く</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function SoftPrerequisiteHint({
  unmetSoftPrerequisites,
}: {
  unmetSoftPrerequisites: AtomViewModel[]
}) {
  if (unmetSoftPrerequisites.length === 0) {
    return null
  }

  return (
    <Card
      role="note"
      aria-label="おすすめの前提レッスン"
      className="border-sky-200/80 bg-sky-50/70 shadow-sm dark:border-sky-500/30 dark:bg-sky-500/5"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-sky-900 dark:text-sky-100">
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
          このレッスンの前に学ぶと理解しやすい関連レッスン
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-sky-900/90 dark:text-sky-100/90">
        <p>
          必須ではありませんが、先に目を通しておくとスムーズに進められるレッスンがあります。
        </p>
        <ul className="space-y-2">
          {unmetSoftPrerequisites.map((prerequisite) => (
            <li key={prerequisite.atomId}>
              <Link
                href={`/lessons/${prerequisite.atomId}`}
                className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-sky-800 transition hover:border-sky-400 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-slate-950/50 dark:text-sky-100 dark:hover:border-sky-400/60 dark:hover:bg-sky-500/10"
              >
                {prerequisite.title}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function AtomDetailView({
  atom,
  prerequisites,
  learnerProfile,
  learnerBlockers,
  recentFeedback,
}: {
  atom: AtomViewModel
  prerequisites: AtomViewModel[]
  learnerProfile?: LearnerProfile | null
  learnerBlockers?: string[]
  recentFeedback?: string | null
}) {
  const prerequisitesById = useMemo(
    () => new Map(prerequisites.map((prerequisite) => [prerequisite.atomId, prerequisite])),
    [prerequisites],
  )

  // Compute unmet soft prereqs client-side against the learner's completion
  // state. Soft prereqs are non-blocking hints — we only surface the ones
  // the learner has NOT yet completed and that we actually have metadata
  // for (unknown atoms are silently dropped to avoid broken links).
  const softPrerequisiteIds = atom.softPrerequisites
  const completedSoftPrerequisiteIds = useCompletedLessonIds(softPrerequisiteIds)
  const unmetSoftPrerequisites = useMemo(() => {
    if (softPrerequisiteIds.length === 0) {
      return []
    }
    const completedSet = new Set(completedSoftPrerequisiteIds)
    return softPrerequisiteIds
      .filter((atomId) => !completedSet.has(atomId))
      .flatMap((atomId) => {
        const prerequisite = prerequisitesById.get(atomId)
        return prerequisite ? [prerequisite] : []
      })
  }, [softPrerequisiteIds, completedSoftPrerequisiteIds, prerequisitesById])

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,#f8fbff_0%,#fff9f1_42%,#ffffff_100%)] text-slate-950 dark:bg-[linear-gradient(180deg,#0a1628_0%,#111827_42%,#0f172a_100%)] dark:text-slate-50">
      <LessonStartedTracker
        lessonId={atom.atomId}
        lessonTitle={atom.title}
        trackId={atom.goalTags[0] ?? null}
      />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/lessons"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-orange-300 hover:text-orange-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:border-orange-400/40 dark:hover:text-orange-200"
        >
          <ArrowLeft className="h-4 w-4" />
          レッスン一覧に戻る
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <SoftPrerequisiteHint unmetSoftPrerequisites={unmetSoftPrerequisites} />
            <Card className="border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <CardHeader className="space-y-4">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{atom.atomId}</p>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{atom.title}</h1>
                  <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                    {atom.summary}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {atom.capabilityOutputs.length > 0
                    ? atom.capabilityOutputs.map((output) => {
                        const entry = describeCapability(output)
                        return (
                          <span
                            key={output}
                            className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200"
                          >
                            {output}
                            <InfoTooltip
                              ariaLabel={`${output} の説明を表示`}
                              heading={entry.term}
                              description={entry.description}
                              className="text-orange-500/80 hover:text-orange-700 dark:text-orange-300/80 dark:hover:text-orange-100"
                            />
                          </span>
                        )
                      })
                    : (
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
                        出力タグ未設定
                      </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-4 w-4" />
                    {atom.estimatedMinutes ? `${atom.estimatedMinutes} 分` : '想定時間未設定'}
                  </span>
                  <span>公開状態: {atom.status}</span>
                </div>
              </CardHeader>
            </Card>

            <AtomBodyRenderer
              atom={atom}
              learnerBlockers={learnerBlockers}
              recentFeedback={recentFeedback}
            />
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">
                  <span className="inline-flex items-center gap-1.5">
                    成果物
                    <InfoTooltip
                      ariaLabel="成果物とは何かを表示"
                      heading={DELIVERABLE_GLOSSARY.term}
                      description={DELIVERABLE_GLOSSARY.description}
                    />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p>種類: {atom.deliverable.type || '未設定'}</p>
                <p>検証: {atom.deliverable.validation || '未設定'}</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">証跡とメディア</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                    証跡
                    <InfoTooltip
                      ariaLabel="証跡とは何かを表示"
                      heading={EVIDENCE_GLOSSARY.term}
                      description={EVIDENCE_GLOSSARY.description}
                    />
                  </p>
                  {renderMetaBadges(atom.evidence, '未設定')}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">メディア</p>
                  {renderMetaBadges(atom.mediaSlots, '未設定')}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">前提 atom</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <PrerequisiteList
                  title="必須"
                  atomIds={atom.hardPrerequisites}
                  prerequisitesById={prerequisitesById}
                  strength="hard"
                />
                <PrerequisiteList
                  title="あると楽"
                  atomIds={atom.softPrerequisites}
                  prerequisitesById={prerequisitesById}
                  strength="soft"
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">学習完了</CardTitle>
              </CardHeader>
              <CardContent>
                <LessonCompleteButton
                  lessonId={atom.atomId}
                  learnerProfile={learnerProfile}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
