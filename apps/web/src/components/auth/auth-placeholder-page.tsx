'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@school/ui/button'
import { cn } from '@/lib/utils'

type AuthPlaceholderPageProps = {
  badge: string
  title: string
  description: string
  noteTitle: string
  noteBody: string
  accentClassName: string
  panelClassName: string
  icon: LucideIcon
  secondaryHref: '/login' | '/signup'
  secondaryLabel: string
}

export function AuthPlaceholderPage({
  badge,
  title,
  description,
  noteTitle,
  noteBody,
  accentClassName,
  panelClassName,
  icon: Icon,
  secondaryHref,
  secondaryLabel,
}: AuthPlaceholderPageProps) {
  return (
    <div className="theme-page-shell relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 left-1/2 h-72 w-72 -translate-x-[140%] rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/20" />
        <div className="absolute bottom-0 right-0 h-80 w-80 translate-x-1/4 translate-y-1/4 rounded-full bg-fuchsia-300/20 blur-3xl dark:bg-fuchsia-500/20" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-16 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="w-full max-w-3xl"
        >
          <div className="theme-panel-strong overflow-hidden rounded-[2rem]">
            <div className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-700/70 sm:px-8">
              <div className="theme-chip-solid inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', accentClassName)} />
                {badge}
              </div>
            </div>

            <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <div
                  className={cn(
                    'mb-5 inline-flex h-16 w-16 items-center justify-center rounded-3xl shadow-lg',
                    panelClassName
                  )}
                >
                  <Icon className="h-7 w-7" />
                </div>
                <h1 className="max-w-xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                  {title}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
                  {description}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/plan"
                    className={cn(
                      buttonVariants({ size: 'lg' }),
                      'h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 text-white shadow-lg shadow-blue-500/20 hover:opacity-95'
                    )}
                  >
                    プラン作成へ進む
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={secondaryHref}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'h-12 rounded-2xl px-6'
                    )}
                  >
                    {secondaryLabel}
                  </Link>
                </div>
              </div>

              <div className="theme-panel-muted rounded-[1.75rem] p-6">
                <p className="text-sm font-semibold tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400">
                  プレビューモード
                </p>
                <h2 className="mt-4 text-xl font-semibold text-foreground">
                  {noteTitle}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {noteBody}
                </p>

                <div className="mt-6 space-y-3">
                  {[
                    'ダッシュボードを直接表示',
                    'コース、レッスン、課題をそのまま閲覧',
                    '認証導線はUIだけ保持して後日実装',
                  ].map((item) => (
                    <div
                      key={item}
                      className="theme-chip-solid flex items-center gap-3 rounded-2xl px-4 py-3 text-sm"
                    >
                      <span className={cn('h-2.5 w-2.5 rounded-full', accentClassName)} />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
