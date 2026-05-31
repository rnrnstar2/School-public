'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { BookOpen, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConnectedLessonEntry {
  lessonId: string
  title: string
  summary: string
  moduleTitle: string
}

interface ConnectedLessonsAccordionProps {
  lessons: ConnectedLessonEntry[]
  buildHref: (lessonId: string) => string
  className?: string
}

export function ConnectedLessonsAccordion({
  lessons,
  buildHref,
  className,
}: ConnectedLessonsAccordionProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  if (lessons.length === 0) {
    return null
  }

  return (
    <section
      className={cn(
        'rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950/80 sm:p-7',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
            <BookOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            前後で見るとつながるレッスン
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            前提レッスンや次のレッスンを確認したいときだけ開けます。
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {lessons.length}件
          <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
        </span>
      </button>

      {open ? (
        <div id={panelId} className="mt-5 grid gap-3 sm:grid-cols-2">
          {lessons.map((lesson) => (
            <Link
              key={lesson.lessonId}
              href={buildHref(lesson.lessonId)}
              className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 transition hover:border-orange-300 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-orange-400/40"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {lesson.moduleTitle}
              </p>
              <p className="mt-2 text-base font-semibold text-slate-950 dark:text-slate-50">{lesson.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{lesson.summary}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}
