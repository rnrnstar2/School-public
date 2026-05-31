'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight,
  ChevronRight,
  GitBranch,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@school/ui/button'
import { recommendBranch } from '@/lib/lessons/branch-recommender'
import type { LearnerProfile } from '@/types'

interface FlowNextLesson {
  lessonId: string
  title: string
  summary: string
  estimatedMinutes: number
  flowType: 'linear' | 'branch'
  branchLabel?: string
}

interface FlowResolution {
  isBranch: boolean
  nextLessons: FlowNextLesson[]
  mergePointId?: string
  isTrackEnd: boolean
}

interface NextLessonFlowProps {
  flow: FlowResolution
  learnerProfile?: LearnerProfile | null
  /** Callback to open mentor chat for next-lesson advice */
  onAskMentor?: () => void
  buildHref?: (lessonId: string) => string
}

function getPrimaryLesson(params: {
  flow: FlowResolution
  learnerProfile?: LearnerProfile | null
}) {
  if (params.flow.nextLessons.length === 0) {
    return {
      lesson: null,
      recommendationReason: null,
    }
  }

  if (!params.flow.isBranch || params.flow.nextLessons.length === 1) {
    return {
      lesson: params.flow.nextLessons[0] ?? null,
      recommendationReason: null,
    }
  }

  const recommendation = recommendBranch({
    branches: params.flow.nextLessons,
    profile: params.learnerProfile,
  })
  const recommendedLesson = recommendation.recommendedLessonId
    ? params.flow.nextLessons.find((lesson) => lesson.lessonId === recommendation.recommendedLessonId) ?? null
    : null

  return {
    lesson: recommendedLesson,
    recommendationReason: recommendedLesson ? recommendation.reason : null,
  }
}

function describeHeroBody(params: {
  flow: FlowResolution
  primaryLesson: FlowNextLesson | null
  recommendationReason: string | null
}) {
  if (!params.primaryLesson) {
    if (params.flow.isTrackEnd) {
      return '次の必須レッスンはありません。学習プランに戻って、次に取り組むテーマを選べます。'
    }

    return '次のレッスンを特定できなかったため、学習プランに戻って次の一手を確認してください。'
  }

  if (params.recommendationReason) {
    return `${params.recommendationReason}。ほかの関連レッスンも必要なら下から確認できます。`
  }

  if (params.flow.isBranch) {
    return 'まずはこのレッスンから進めるのがおすすめです。別ルートは下の関連レッスンから確認できます。'
  }

  if (params.primaryLesson.summary) {
    return params.primaryLesson.summary
  }

  return 'いちばん自然につながる次のレッスンです。'
}

export function NextLessonFlow({
  flow,
  learnerProfile,
  onAskMentor,
  buildHref,
}: NextLessonFlowProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const { lesson: primaryLesson, recommendationReason } = getPrimaryLesson({
    flow,
    learnerProfile,
  })
  const relatedLessons = primaryLesson
    ? flow.nextLessons.filter((lesson) => lesson.lessonId !== primaryLesson.lessonId)
    : flow.nextLessons
  const heroHref = primaryLesson ? buildHref?.(primaryLesson.lessonId) ?? `/lessons/${primaryLesson.lessonId}` : '/plan'
  const heroTitle = primaryLesson ? `次のレッスンへ: ${primaryLesson.title}` : 'プランに戻る'
  const heroEyebrow = primaryLesson
    ? flow.isBranch
      ? 'おすすめの次レッスン'
      : '次にやること'
    : flow.isTrackEnd
      ? 'トラック完了'
      : '次の一手'
  const heroBody = describeHeroBody({
    flow,
    primaryLesson,
    recommendationReason,
  })

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mt-4 rounded-[24px] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950/80"
      data-next-flow="true"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
          {primaryLesson ? (
            flow.isBranch ? <GitBranch className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-200">
            {heroEyebrow}
          </p>
          <p className="mt-2 text-base font-semibold text-slate-950 dark:text-slate-50 sm:text-lg">
            {flow.isTrackEnd && !primaryLesson ? 'すべてのレッスンを完了しました。' : heroTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {heroBody}
          </p>
          {primaryLesson && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              {primaryLesson.branchLabel && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                  {primaryLesson.branchLabel}
                </span>
              )}
              {recommendationReason && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                  {recommendationReason}
                </span>
              )}
              {primaryLesson.estimatedMinutes > 0 && (
                <span>約{primaryLesson.estimatedMinutes}分</span>
              )}
            </div>
          )}
        </div>
      </div>

      <Link
        href={heroHref}
        className={cn(
          buttonVariants({ size: 'lg' }),
          'mt-5 flex h-auto w-full items-center justify-between gap-3 rounded-[20px] bg-blue-600 px-5 py-4 text-left text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400'
        )}
        data-next-flow-hero-cta="true"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/90">
            {primaryLesson ? 'Hero CTA' : 'Fallback CTA'}
          </span>
          <span className="mt-1 block truncate text-base font-semibold sm:text-lg">
            {heroTitle}
          </span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" />
      </Link>

      <div
        className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
        data-next-flow-secondary-actions="true"
      >
        <Link
          href="/lessons"
          className="font-medium text-slate-600 underline underline-offset-4 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
        >
          完了レッスン一覧
        </Link>
        <Link
          href="/plan"
          className="font-medium text-slate-600 underline underline-offset-4 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50"
        >
          プランに戻る
        </Link>
      </div>

      {relatedLessons.length > 0 && (
        <details
          className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
          data-next-flow-related-lessons="true"
        >
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 dark:text-slate-100">
            <span className="inline-flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              関連レッスンをみる ({relatedLessons.length})
            </span>
          </summary>
          <div className="mt-3 space-y-2">
            <AnimatePresence mode="wait">
              {relatedLessons.map((lesson, index) => (
                <motion.div
                  key={lesson.lessonId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * index }}
                >
                  <BranchChoiceCard
                    lesson={lesson}
                    isSelected={selected === lesson.lessonId}
                    onSelect={() => setSelected(lesson.lessonId)}
                    recommendReason={undefined}
                    buildHref={buildHref}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {onAskMentor && (
              <button
                type="button"
                onClick={onAskMentor}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 underline underline-offset-4 transition hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-300"
              >
                <MessageCircle className="h-4 w-4" />
                メンターに相談して選ぶ
              </button>
            )}

            {flow.mergePointId && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                どのパスも完了後に合流します
              </p>
            )}
          </div>
        </details>
      )}
    </motion.section>
  )
}

function BranchChoiceCard({
  lesson,
  isSelected,
  onSelect,
  recommendReason,
  buildHref,
}: {
  lesson: FlowNextLesson
  isSelected: boolean
  onSelect: () => void
  recommendReason?: string
  buildHref?: (lessonId: string) => string
}) {
  return (
    <div
      className={cn(
        'rounded-[18px] border p-4 transition',
        isSelected
          ? 'border-indigo-400 bg-indigo-50/80 dark:border-indigo-600 dark:bg-indigo-950/40'
          : 'border-slate-200 bg-white/80 hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-indigo-700'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {lesson.branchLabel && (
            <span className="mb-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              {lesson.branchLabel}
            </span>
          )}
          {recommendReason && (
            <span className="mb-1 ml-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              {recommendReason}
            </span>
          )}
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            {lesson.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {lesson.summary}
          </p>
          {lesson.estimatedMinutes > 0 && (
            <span className="mt-1 inline-block text-xs text-slate-400 dark:text-slate-500">
              約{lesson.estimatedMinutes}分
            </span>
          )}
        </div>
      </div>
      <div className="mt-3">
        {isSelected ? (
          <Link
            href={buildHref?.(lesson.lessonId) ?? `/lessons/${lesson.lessonId}`}
            className={cn(
              buttonVariants({ size: 'sm' }),
              'w-full rounded-xl bg-indigo-600 text-white hover:bg-indigo-700'
            )}
          >
            <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
            このパスで進む
          </Link>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'w-full rounded-xl'
            )}
          >
            選択する
          </button>
        )}
      </div>
    </div>
  )
}
