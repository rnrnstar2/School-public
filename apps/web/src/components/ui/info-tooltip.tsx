'use client'

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  /**
   * Plain-text description shown to screen readers and inside the popover.
   * Keep this short — one or two sentences in plain Japanese.
   */
  description: string
  /**
   * Accessible label for the trigger button.
   * Defaults to "用語の説明を表示".
   */
  ariaLabel?: string
  /** Optional richer content rendered above the description. */
  heading?: ReactNode
  /** Optional class for the trigger button. */
  className?: string
}

/**
 * Lightweight info tooltip used to surface plain-Japanese explanations
 * for technical jargon (deliverable / evidence / capability badges).
 *
 * Behavior:
 *  - Trigger is a real <button>, so it works with keyboard and assistive
 *    technologies out of the box.
 *  - Opens on hover (mouse), focus (keyboard) and click/tap (mobile).
 *  - Closes on Escape, blur, or outside click.
 *  - Tooltip body is associated with the trigger via aria-describedby so
 *    screen readers announce the explanation when the trigger is focused
 *    even if the user never opens the popover visually.
 */
export function InfoTooltip({
  description,
  ariaLabel = '用語の説明を表示',
  heading,
  className,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const reactId = useId()
  const tooltipId = `info-tooltip-${reactId}`

  const close = useCallback(() => setOpen(false), [])

  // Close when clicking/tapping outside.
  useEffect(() => {
    if (!open) return
    function handleDocumentPointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (containerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleDocumentPointer)
    document.addEventListener('touchstart', handleDocumentPointer)
    return () => {
      document.removeEventListener('mousedown', handleDocumentPointer)
      document.removeEventListener('touchstart', handleDocumentPointer)
    }
  }, [open])

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={tooltipId}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          // Don't close if focus moved into the tooltip itself.
          if (containerRef.current?.contains(event.relatedTarget as Node)) return
          setOpen(false)
        }}
        onClick={(event) => {
          // On touch devices the tooltip should toggle on tap.
          event.stopPropagation()
          setOpen((prev) => !prev)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            close()
          }
        }}
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors',
          'hover:text-slate-600 focus-visible:text-slate-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'dark:text-slate-500 dark:hover:text-slate-200 dark:focus-visible:text-slate-100',
          className,
        )}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        // Always rendered so screen readers using aria-describedby can find
        // it; visually hidden when closed.
        className={cn(
          'pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-relaxed text-slate-700 shadow-lg transition-opacity duration-150',
          'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
          open ? 'opacity-100' : 'sr-only opacity-0',
        )}
      >
        {heading && (
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {heading}
          </span>
        )}
        {description}
      </span>
    </span>
  )
}
