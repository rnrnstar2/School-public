'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ClipboardCheck, Loader2, PartyPopper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@school/ui/button'
import { NextLessonFlow } from '@/components/lesson/next-lesson-flow'
import { AiToolLaunchCard } from '@/components/plan/ai-tool-launch-card'
import { isLessonCompleted as isLessonCompletedV2, setLocalLessonComplete as setLocalLessonCompleteV2 } from '@/lib/lesson-completion-v2'
import type { NextAtomResult } from '@/lib/atoms/next-atom-resolver'
import { supabase } from '@/lib/supabase/client'
import type { LearnerProfile } from '@/types'

interface FlowResolution {
  isBranch: boolean
  nextLessons: Array<{
    lessonId: string
    title: string
    summary: string
    estimatedMinutes: number
    flowType: 'linear' | 'branch'
    branchLabel?: string
  }>
  mergePointId?: string
  isTrackEnd: boolean
}

interface NextLessonInfo {
  id?: string
  lesson_id?: string
  title: string
}

interface LessonCompleteButtonProps {
  lessonId: string
  courseId?: string | null
  initialCompleted?: boolean
  learnerProfile?: LearnerProfile | null
  confirmationMethod?: string | null
  onOpenChat?: () => void
  buildNextLessonHref?: (lessonId: string) => string
}

interface CompletionResponse {
  ok?: boolean
  error?: string
  next?: NextAtomResult
}

function nextAtomResultToFlow(result: NextAtomResult | null | undefined): FlowResolution | null {
  if (!result) {
    return null
  }

  if (result.kind === 'plan_complete') {
    return {
      isBranch: false,
      nextLessons: [],
      isTrackEnd: true,
    }
  }

  if ((result.kind === 'next' || result.kind === 'milestone_complete') && result.nextAtomId) {
    return {
      isBranch: false,
      nextLessons: [
        {
          lessonId: result.nextAtomId,
          title: result.nextAtomTitle ?? result.nextAtomId,
          summary: '',
          estimatedMinutes: 0,
          flowType: 'linear',
        },
      ],
      isTrackEnd: false,
    }
  }

  return null
}

function nextAtomResultToLesson(result: NextAtomResult | null | undefined): NextLessonInfo | null {
  if (!result?.nextAtomId) {
    return null
  }

  return {
    id: result.nextAtomId,
    lesson_id: result.nextAtomId,
    title: result.nextAtomTitle ?? result.nextAtomId,
  }
}

export function LessonCompleteButton({
  lessonId,
  courseId,
  initialCompleted = false,
  learnerProfile,
  confirmationMethod,
  onOpenChat,
  buildNextLessonHref,
}: LessonCompleteButtonProps) {
  const [completed, setCompleted] = useState(initialCompleted)
  const [loading, setLoading] = useState(false)
  const [nextLesson, setNextLesson] = useState<NextLessonInfo | null>(null)
  const [flowResolution, setFlowResolution] = useState<FlowResolution | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [checkedItems, setCheckedItems] = useState<boolean[]>([])
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  // Parse confirmation items for checklist
  const confirmationItems = useMemo(() => {
    if (!confirmationMethod) return []
    return confirmationMethod
      .split(/\n|(?<=。)/)
      .map((s) => s.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean)
  }, [confirmationMethod])

  const confirmed = confirmationItems.length > 0 && checkedItems.length === confirmationItems.length && checkedItems.every(Boolean)

  const resolveNextLessonHref = useCallback(
    (targetLessonId: string) => buildNextLessonHref?.(targetLessonId) ?? `/lessons/${targetLessonId}`,
    [buildNextLessonHref]
  )

  const loadFlowResolution = useCallback(async () => {
    try {
      const response = await fetch(`/api/atoms/${lessonId}/next`)
      const data = (await response.json()) as { next?: NextAtomResult }
      const nextFlow = nextAtomResultToFlow(data.next)
      setFlowResolution(nextFlow)
      setNextLesson(nextAtomResultToLesson(data.next))
    } catch {
      // Best-effort only.
    }
  }, [lessonId])

  // Resolve auth state once so preview-mode localStorage never overrides DB progress.
  useEffect(() => {
    let active = true

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) {
        setIsAuthenticated(Boolean(user))
      }
    }).catch(() => {
      if (active) {
        setIsAuthenticated(false)
      }
    })

    return () => {
      active = false
    }
  }, [lessonId, initialCompleted])

  useEffect(() => {
    if (initialCompleted) {
      setCompleted(true)
    }
  }, [initialCompleted])

  // Preview mode only: localStorage can seed completion state when there is no session.
  useEffect(() => {
    if (isAuthenticated !== false) {
      return
    }

    const isCompletedLocal = isLessonCompletedV2(lessonId)
    if (!initialCompleted && isCompletedLocal) {
      setCompleted(true)
    }
  }, [initialCompleted, isAuthenticated, lessonId])

  useEffect(() => {
    const isPreviewCompleted = isAuthenticated === false && isLessonCompletedV2(lessonId)

    if ((initialCompleted || isPreviewCompleted) && !flowResolution) {
      void loadFlowResolution()
    }
  }, [flowResolution, initialCompleted, isAuthenticated, lessonId, loadFlowResolution])

  const handleAskMentor = useCallback(() => {
    if (onOpenChat) {
      onOpenChat()
    }
  }, [onOpenChat])

  function handleCompleteClick() {
    if (completed || loading) return
    // If confirmation method exists and not yet confirmed, show checklist
    if (confirmationItems.length > 0 && !confirmed) {
      setCheckedItems(new Array(confirmationItems.length).fill(false))
      setShowConfirmation(true)
      return
    }
    void handleComplete()
  }

  async function handleComplete() {
    if (completed || loading) {
      return
    }

    setLoading(true)
    setError(null)
    setShowConfirmation(false)

    try {
      const res = await fetch(`/api/lessons/${lessonId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = (await res.json()) as CompletionResponse

      if (!res.ok) {
        // Unauthenticated (preview mode): save to localStorage instead
        if (res.status === 401) {
          setLocalLessonCompleteV2(lessonId)
          setCompleted(true)
          setShowSuccess(true)
          void loadFlowResolution()
          return
        }
        setError(data.error ?? '完了処理に失敗しました。')
        return
      }

      // Also save to localStorage so preview mode stays consistent
      setLocalLessonCompleteV2(lessonId)
      setCompleted(true)
      setShowSuccess(true)

      const nextFlow = nextAtomResultToFlow(data.next)
      setFlowResolution(nextFlow)
      setNextLesson(nextAtomResultToLesson(data.next))
    } catch {
      setError('通信エラーが発生しました。')
    } finally {
      setLoading(false)
    }
  }

  const nextLessonId = nextLesson?.lesson_id ?? nextLesson?.id
  const effectiveFlow = useMemo<FlowResolution | null>(() => {
    if (flowResolution) {
      return flowResolution
    }

    if (nextLesson && nextLessonId) {
      return {
        isBranch: false,
        nextLessons: [
          {
            lessonId: nextLessonId,
            title: nextLesson.title,
            summary: '',
            estimatedMinutes: 0,
            flowType: 'linear',
          },
        ],
        isTrackEnd: false,
      }
    }

    if (!showSuccess) {
      return null
    }

    return {
      isBranch: false,
      nextLessons: [],
      isTrackEnd: Boolean(courseId),
    }
  }, [courseId, flowResolution, nextLesson, nextLessonId, showSuccess])

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {!completed ? (
          <motion.div key="button" exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>
            <button
              type="button"
              onClick={handleCompleteClick}
              disabled={loading}
              className={cn(
                buttonVariants({ size: 'lg' }),
                'h-12 w-full rounded-2xl px-6 text-base font-semibold',
                'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-400'
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  処理中...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  レッスン完了
                </>
              )}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="completed"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="rounded-[24px] border border-emerald-200 bg-emerald-50/90 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/40"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/50">
                {showSuccess ? (
                  <PartyPopper className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                )}
              </div>
              <div>
                <p className="text-base font-semibold text-emerald-800 dark:text-emerald-100">
                  {showSuccess ? 'レッスン完了!' : 'このレッスンは完了済みです'}
                </p>
                <p className="mt-0.5 text-sm text-emerald-700 dark:text-emerald-200">
                  進捗が記録されました
                </p>
              </div>
            </div>

            {effectiveFlow && (
              <NextLessonFlow
                flow={effectiveFlow}
                learnerProfile={learnerProfile}
                onAskMentor={onOpenChat ? handleAskMentor : undefined}
                buildHref={resolveNextLessonHref}
              />
            )}

            {effectiveFlow && effectiveFlow.nextLessons.length === 0 && showSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="mt-4"
              >
                {/* TODO: wire preferredTools from learner_profile */}
                <AiToolLaunchCard tools={[]} />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConfirmation && !completed && (
          <motion.div
            key="confirmation"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="rounded-[24px] border border-amber-200 bg-amber-50/90 p-5 dark:border-amber-900/40 dark:bg-amber-950/40"
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
              <ClipboardCheck className="h-4 w-4" />
              完了前チェック
            </div>
            <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">
              以下の確認方法を満たしていることを確認してください。
            </p>
            <div className="space-y-2">
              {confirmationItems.map((item, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-white/80 px-4 py-3 transition hover:border-amber-300 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:border-amber-700"
                >
                  <input
                    type="checkbox"
                    checked={checkedItems[i] ?? false}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-amber-300 text-emerald-600 focus:ring-emerald-500"
                    onChange={() => {
                      setCheckedItems((prev) => {
                        const next = [...prev]
                        next[i] = !next[i]
                        return next
                      })
                    }}
                  />
                  <span className="text-sm leading-6 text-amber-900 dark:text-amber-100">{item}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => void handleComplete()}
                disabled={!confirmed || loading}
                className={cn(
                  buttonVariants({ size: 'sm' }),
                  'rounded-xl',
                  confirmed
                    ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                    : 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    確認して完了
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'rounded-xl')}
              >
                戻る
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </motion.p>
      )}
    </div>
  )
}
