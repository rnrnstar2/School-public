'use client'

import { useId, useState, type ElementType, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CountAccordionSectionProps {
  title: string
  count: number | string
  children: ReactNode
  defaultOpen?: boolean
  icon?: ElementType
  description?: string
  testId?: string
  badgeClassName?: string
  className?: string
  contentClassName?: string
}

export function CountAccordionSection({
  title,
  count,
  children,
  defaultOpen = false,
  icon: Icon,
  description,
  testId,
  badgeClassName,
  className,
  contentClassName,
}: CountAccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <section
      className={cn('rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/80', className)}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:bg-slate-900/70"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300">
          {open ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
        </span>

        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-200">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              {description}
            </span>
          ) : null}
        </span>

        <span
          className={cn(
            'inline-flex min-w-8 items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200',
            badgeClassName,
          )}
        >
          {count}
        </span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className={cn('border-t border-slate-200 px-4 py-4 dark:border-slate-800', contentClassName)}
      >
        {children}
      </div>
    </section>
  )
}
