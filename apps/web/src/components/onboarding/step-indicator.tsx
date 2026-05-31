'use client'

import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

const STEP_LABELS = [
  'ゴール入力',
  'ツール・環境',
  '制作経験と目的',
  '確認',
] as const

export type WizardStep = 0 | 1 | 2 | 3 | 4

interface StepIndicatorProps {
  currentStep: WizardStep
  className?: string
}

export function StepIndicator({ currentStep, className }: StepIndicatorProps) {
  // Step 0 = intro screen. Indicator only shows steps 1-4, and stays in
  // "before-start" state while currentStep === 0 so the user has a clear
  // sense that the questionnaire has not yet begun.
  return (
    <nav
      aria-label="ウィザードの進捗"
      className={cn('flex items-center justify-center gap-1 sm:gap-2', className)}
    >
      {STEP_LABELS.map((label, index) => {
        const stepNumber = (index + 1) as 1 | 2 | 3 | 4
        const isCompleted = stepNumber < currentStep
        const isCurrent = stepNumber === currentStep

        return (
          <div key={label} className="flex items-center">
            {index > 0 && (
              <div
                className={cn(
                  'mx-1 h-px w-4 sm:mx-2 sm:w-8',
                  isCompleted ? 'bg-primary' : 'bg-border',
                )}
                aria-hidden="true"
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'border-2 border-primary bg-primary/10 text-primary',
                  !isCompleted && !isCurrent && 'border border-border bg-muted text-muted-foreground',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  stepNumber
                )}
              </div>
              <span
                className={cn(
                  'hidden text-[10px] sm:block',
                  isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </nav>
  )
}
