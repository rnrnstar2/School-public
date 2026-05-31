'use client'

import type { ReactNode } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@school/ui/card'
import {
  ATOM_CONTENT_TYPE_OPTIONS,
  AtomsFilterProvider,
  useAtomsFilterContext,
  type AtomContentTypeFilter,
  type AtomsBrowserMeta,
  type AtomStatusFilter,
} from './atoms-browser-context'

export function AtomsBrowserShell({
  children,
  initialMeta,
}: {
  children: ReactNode
  initialMeta?: Partial<AtomsBrowserMeta>
}) {
  return (
    <AtomsFilterProvider initialMeta={initialMeta}>
      <AtomsBrowserShellContent>{children}</AtomsBrowserShellContent>
    </AtomsFilterProvider>
  )
}

function AtomsBrowserShellContent({ children }: { children: ReactNode }) {
  const {
    searchQuery,
    setSearchQuery,
    personaTag,
    setPersonaTag,
    goalTag,
    setGoalTag,
    status,
    setStatus,
    contentType,
    setContentType,
    browserMeta,
  } = useAtomsFilterContext()

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,#fdfbf7_0%,#f4fbff_42%,#eef4fb_100%)] text-slate-950 dark:bg-[linear-gradient(180deg,#0b1320_0%,#0f172a_42%,#111827_100%)] dark:text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200">
              <Sparkles className="h-3.5 w-3.5" />
              レッスンライブラリ
            </p>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">レッスン一覧</h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                目標やスキルに合ったレッスンを探せます。キーワードやカテゴリで絞り込みできます。
              </p>
            </div>
          </div>

          <Card className="border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">表示件数</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold">{browserMeta.filteredCount ?? '...'}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">全 {browserMeta.totalCount ?? '-'} 件</p>
              </div>
              {/* count-only — no extra explanation needed */}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.7fr))]">
            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>検索</span>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="タイトル / キーワード"
                  aria-label="レッスンを検索"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>ペルソナ</span>
              <select
                value={personaTag}
                onChange={(event) => setPersonaTag(event.target.value)}
                aria-label="ペルソナで絞り込む"
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="all">すべて</option>
                {browserMeta.personaOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>目標</span>
              <select
                value={goalTag}
                onChange={(event) => setGoalTag(event.target.value)}
                aria-label="目標で絞り込む"
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="all">すべて</option>
                {browserMeta.goalOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>コンテンツ種別</span>
              <select
                value={contentType}
                onChange={(event) => setContentType(event.target.value as AtomContentTypeFilter)}
                aria-label="コンテンツ種別で絞り込む"
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                {ATOM_CONTENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>公開状態</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as AtomStatusFilter)}
                aria-label="公開状態で絞り込む"
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="all">すべて</option>
                <option value="draft">draft / 下書き</option>
                <option value="reviewed">reviewed / レビュー済み</option>
                <option value="experimental">experimental / 試験運用</option>
                <option value="stable">stable / 安定</option>
              </select>
            </label>
          </CardContent>
        </Card>

        {children}
      </div>
    </div>
  )
}
