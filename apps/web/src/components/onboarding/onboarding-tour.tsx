'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MessageCircle,
  Sparkles,
  Target,
  X,
} from 'lucide-react'

/* ---------- constants ---------- */

const TOUR_COMPLETED_KEY = 'school:onboarding-tour-completed'

export interface TourStep {
  /** aria-label value of the target section */
  targetLabel: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  position: 'top' | 'bottom'
}

const TOUR_STEPS: TourStep[] = [
  {
    targetLabel: 'ゴールと進捗',
    title: 'ゴールと進捗',
    description: 'あなたのゴールと、全体の進捗をここで確認できます。プログレスバーで完了状況が一目で分かります。',
    icon: Target,
    position: 'bottom',
  },
  {
    targetLabel: 'いまの現在地',
    title: '現在地の確認',
    description: '今取り組んでいるステップがここに表示されます。迷ったらここを確認しましょう。',
    icon: MapPin,
    position: 'bottom',
  },
  {
    targetLabel: '今やること',
    title: '今やること',
    description: '現在のタスクの詳細と、おすすめのレッスンがここに表示されます。レッスンをタップして学習を始めましょう。',
    icon: Sparkles,
    position: 'bottom',
  },
  {
    targetLabel: 'メンターチャット',
    title: 'メンターに相談',
    description: 'AIメンターに質問や相談ができます。学習中に困ったことがあれば、いつでもここで聞いてみましょう。',
    icon: MessageCircle,
    position: 'top',
  },
  {
    targetLabel: '詳細情報',
    title: '詳細情報',
    description: '学習分析、ヒアリング履歴、メンターメモリなど詳しい情報はここから確認できます。',
    icon: BookOpen,
    position: 'top',
  },
]

/* ---------- helpers ---------- */

export function isTourCompleted(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(TOUR_COMPLETED_KEY) === '1'
}

export function resetTourCompleted(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOUR_COMPLETED_KEY)
}

function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, '1')
  } catch {
    /* noop */
  }
}

/* ---------- component ---------- */

export interface OnboardingTourProps {
  /** Whether the tour should be shown */
  active: boolean
  /** Called when tour is completed or skipped */
  onComplete: () => void
}

export function OnboardingTour({ active, onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const step = TOUR_STEPS[currentStep]
  const isLast = currentStep === TOUR_STEPS.length - 1

  // Find and scroll to the target element
  const updateTarget = useCallback(() => {
    if (!active || !step) return
    const el = document.querySelector(`[aria-label="${step.targetLabel}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Wait for scroll to settle before measuring
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTargetRect(el.getBoundingClientRect())
        })
      })
    } else {
      setTargetRect(null)
    }
  }, [active, step])

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      updateTarget()
    })

    return () => cancelAnimationFrame(rafId)
  }, [updateTarget])

  // Update rect on scroll/resize
  useEffect(() => {
    if (!active) return

    let rafId: number
    const handleUpdate = () => {
      rafId = requestAnimationFrame(() => {
        if (!step) return
        const el = document.querySelector(`[aria-label="${step.targetLabel}"]`)
        if (el) {
          setTargetRect(el.getBoundingClientRect())
        }
      })
    }

    window.addEventListener('scroll', handleUpdate, { passive: true })
    window.addEventListener('resize', handleUpdate, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleUpdate)
      window.removeEventListener('resize', handleUpdate)
      cancelAnimationFrame(rafId)
    }
  }, [active, step])

  // Close on Escape
  useEffect(() => {
    if (!active) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        markTourCompleted()
        onComplete()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [active, onComplete])

  const handleNext = useCallback(() => {
    if (isLast) {
      markTourCompleted()
      onComplete()
    } else {
      setCurrentStep((s) => s + 1)
    }
  }, [isLast, onComplete])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
    }
  }, [currentStep])

  const handleSkip = useCallback(() => {
    markTourCompleted()
    onComplete()
  }, [onComplete])

  // Tooltip position calculation
  const tooltipStyle = useMemo(() => {
    if (!targetRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

    const padding = 12
    const tooltipWidth = 320

    // Horizontal centering, clamped to viewport
    let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding))

    if (step?.position === 'bottom') {
      return {
        top: `${targetRect.bottom + padding}px`,
        left: `${left}px`,
        width: `${tooltipWidth}px`,
      }
    }
    // position === 'top': place above the element
    return {
      bottom: `${window.innerHeight - targetRect.top + padding}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
    }
  }, [targetRect, step?.position])

  if (!active || !step) return null

  const Icon = step.icon

  return (
    <>
      {/* Overlay with cutout highlight */}
      <div className="fixed inset-0 z-[9998]" aria-hidden>
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 8}
                  y={targetRect.top - 8}
                  width={targetRect.width + 16}
                  height={targetRect.height + 16}
                  rx={20}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.5)"
            mask="url(#tour-mask)"
          />
        </svg>
      </div>

      {/* Highlight ring around target */}
      {targetRect && (
        <motion.div
          className="pointer-events-none fixed z-[9999] rounded-[20px] ring-2 ring-sky-400 ring-offset-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
          aria-hidden
        />
      )}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: step.position === 'bottom' ? -8 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: step.position === 'bottom' ? -8 : 8 }}
          transition={{ duration: 0.2 }}
          className="fixed z-[10000] rounded-[20px] border border-sky-200 bg-white p-5 shadow-2xl dark:border-sky-800 dark:bg-slate-900"
          style={tooltipStyle}
          role="dialog"
          aria-label={`ツアー: ${step.title}`}
        >
          {/* Skip button */}
          <button
            type="button"
            onClick={handleSkip}
            className="absolute right-3 top-3 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="ツアーをスキップ"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Step indicator */}
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep
                    ? 'w-6 bg-sky-500'
                    : i < currentStep
                      ? 'w-1.5 bg-sky-300 dark:bg-sky-600'
                      : 'w-1.5 bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
            <span className="ml-auto text-xs text-slate-400">
              {currentStep + 1}/{TOUR_STEPS.length}
            </span>
          </div>

          {/* Content */}
          <div className="mt-3 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/40">
              <Icon className="h-5 w-5 text-sky-600 dark:text-sky-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {step.title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {step.description}
              </p>
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 disabled:invisible dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              前へ
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1 rounded-lg bg-sky-700 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-800"
            >
              {isLast ? '完了' : '次へ'}
              {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
