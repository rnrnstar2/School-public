'use client'

import Link from 'next/link'
import { Award, CheckCircle2, GraduationCap, PartyPopper } from 'lucide-react'

const TRACK_LABELS: Record<string, string> = {
  'web-builder-ai': 'Web制作',
  'ai-automation': '業務自動化',
  'ai-content-creator': 'コンテンツ制作',
  'ai-app-builder': 'アプリ制作',
}

interface ShareCertificate {
  id: string
  learner_name: string | null
  goal_summary: string
  plan_title: string | null
  track_id: string | null
  completed_at: string
  milestone_count: number
  criteria_count: number
  criteria_labels: string[]
  shared_at: string | null
}

export function ShareCardView({ certificate: cert }: { certificate: ShareCertificate }) {
  const trackLabel = cert.track_id ? (TRACK_LABELS[cert.track_id] ?? cert.track_id) : null
  const completedDate = cert.completed_at
    ? new Date(cert.completed_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-2xl">
        {/* Card */}
        <div className="rounded-[26px] border border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#fef3c7_50%,#fde68a_100%)] p-8 shadow-xl dark:border-amber-500/30 dark:bg-[linear-gradient(135deg,rgba(251,191,36,0.12)_0%,rgba(30,30,30,1)_100%)]">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/30 dark:bg-amber-500/20">
              <GraduationCap className="h-7 w-7 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-amber-700 dark:text-amber-400">
                CERTIFICATE OF COMPLETION
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                School — AI を使う、次世代スクール
              </p>
            </div>
            {trackLabel && (
              <span className="ml-auto rounded-full border border-amber-300/50 bg-amber-100/60 px-4 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                {trackLabel}
              </span>
            )}
          </div>

          {/* Name & Goal */}
          <div className="mt-6">
            {cert.learner_name && (
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {cert.learner_name}
              </p>
            )}
            <h1 className="mt-1 text-2xl font-bold leading-snug text-slate-900 sm:text-3xl dark:text-white">
              {cert.goal_summary}
            </h1>
            {cert.plan_title && (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                プラン: {cert.plan_title}
              </p>
            )}
          </div>

          {/* Criteria badges */}
          {cert.criteria_labels.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {cert.criteria_labels.map((label, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/60 bg-emerald-50/60 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-300"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="mt-6 flex items-center gap-6 border-t border-amber-200/60 pt-5 dark:border-amber-500/20">
            <div className="flex items-center gap-2">
              <PartyPopper className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">マイルストーン</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{cert.milestone_count}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">卒業基準</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{cert.criteria_count}</p>
              </div>
            </div>
            {completedDate && (
              <div className="ml-auto text-right">
                <p className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">達成日</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{completedDate}</p>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
          >
            <GraduationCap className="h-4 w-4" />
            School で AI 活用を始める
          </Link>
        </div>
      </div>
    </div>
  )
}
