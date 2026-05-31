'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Bot,
  GitBranch,
  MessagesSquare,
  PanelRightOpen,
  Waves,
} from 'lucide-react'

import {
  BRAND_BADGE,
  BRAND_TAGLINE,
  HOMEPAGE_FEATURES,
  HOMEPAGE_FLOW_STEPS,
  HOMEPAGE_PRIMARY_CTA,
  HOMEPAGE_SECONDARY_CTA,
} from '@/lib/constants/branding'

const featureIcons = [GitBranch, MessagesSquare, Waves, Bot, PanelRightOpen] as const

export function HomepageEntry() {
  return (
    <div className="theme-page-shell min-h-screen overflow-hidden">
      <main className="px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-18">
        <section className="relative mx-auto max-w-7xl">
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-[6%] top-10 h-64 w-64 rounded-full bg-orange-200/50 blur-3xl dark:bg-orange-500/10" />
            <div className="absolute right-[8%] top-12 h-72 w-72 rounded-full bg-cyan-200/50 blur-3xl dark:bg-sky-500/10" />
            <div className="absolute bottom-0 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-amber-100/60 blur-3xl dark:bg-slate-800/45" />
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-center">
            <div className="pt-8 sm:pt-14">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/70 bg-orange-50/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-orange-700 dark:border-orange-400/30 dark:bg-orange-500/12 dark:text-orange-100">
                {BRAND_BADGE}
              </div>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                {BRAND_TAGLINE}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
                Goal を共有すると、chat で前提を整え、plan と次の action まで mentor workspace にまとめます。
                学習プラットフォームではなく、やりたいことから迷わず前進するための Goal OS として使えます。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {HOMEPAGE_FLOW_STEPS.map((step) => (
                  <span key={step} className="theme-chip-solid">
                    {step}
                  </span>
                ))}
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {HOMEPAGE_FEATURES.map((feature, index) => {
                  const Icon = featureIcons[index]
                  return (
                    <div
                      key={feature.name}
                      className="theme-panel rounded-[28px] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-200">
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">
                        {feature.name}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold">{feature.title}</h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {feature.description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-5 lg:pl-4">
              <div className="theme-panel-strong rounded-[32px] p-6 sm:p-7">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">はじめ方</p>
                <div className="mt-5 grid gap-4">
                  <Link
                    href={HOMEPAGE_PRIMARY_CTA.href}
                    className="group rounded-[28px] border border-orange-200 bg-[linear-gradient(135deg,#fff6eb_0%,#ffffff_100%)] p-5 transition hover:-translate-y-0.5 dark:border-orange-400/20 dark:bg-[linear-gradient(135deg,rgba(249,115,22,0.12)_0%,rgba(15,23,42,0.78)_100%)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">
                          {HOMEPAGE_PRIMARY_CTA.eyebrow}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold">{HOMEPAGE_PRIMARY_CTA.label}</h2>
                        <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                          {HOMEPAGE_PRIMARY_CTA.description}
                        </p>
                        <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                          {HOMEPAGE_PRIMARY_CTA.title}
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0 text-orange-600 transition group-hover:translate-x-1 dark:text-orange-200" />
                    </div>
                  </Link>

                  <Link
                    href={HOMEPAGE_SECONDARY_CTA.href}
                    className="group rounded-[28px] border border-cyan-200 bg-[linear-gradient(135deg,#effaff_0%,#ffffff_100%)] p-5 transition hover:-translate-y-0.5 dark:border-cyan-400/20 dark:bg-[linear-gradient(135deg,rgba(34,211,238,0.12)_0%,rgba(15,23,42,0.78)_100%)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">
                          {HOMEPAGE_SECONDARY_CTA.eyebrow}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold">{HOMEPAGE_SECONDARY_CTA.label}</h2>
                        <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                          {HOMEPAGE_SECONDARY_CTA.description}
                        </p>
                        <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                          {HOMEPAGE_SECONDARY_CTA.title}
                        </p>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0 text-cyan-600 transition group-hover:translate-x-1 dark:text-cyan-200" />
                    </div>
                  </Link>
                </div>
              </div>

              <div className="theme-panel rounded-[28px] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">mentor workspace の流れ</p>
                <h2 className="mt-2 text-xl font-semibold">goal から action まで、同じ画面で切り替えずに進める</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                  intake で goal を受け取り、chat で前提を揃え、plan で道筋を見せ、action で次の一歩まで固定します。
                  途中で集まる判断や artifact は goal 単位で保持されるので、再開時も文脈が途切れません。
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    'Goal を共有する',
                    'AI と chat で前提を整える',
                    'plan を受け取り優先順位を決める',
                    '次の action をすぐ始める',
                  ].map((item, index) => (
                    <div key={item} className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        Step {index + 1}
                      </p>
                      <p className="mt-2 text-sm font-medium">{item}</p>
                    </div>
                  ))}
                </div>
                <Link
                  href={HOMEPAGE_PRIMARY_CTA.href}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 transition hover:text-orange-700 dark:text-white dark:hover:text-orange-200"
                >
                  {HOMEPAGE_PRIMARY_CTA.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
