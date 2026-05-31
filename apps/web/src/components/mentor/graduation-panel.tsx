'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Award,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  GraduationCap,
  Loader2,
  PartyPopper,
  Target,
} from 'lucide-react'
import type { GraduationCheckResult } from '@/lib/planner/graduation'
import type { GoalHistory } from '@/types'
import { ShareButtons } from '@/components/share/share-buttons'
import { NextStepsSection } from './next-steps-section'
import { LearningJourneyView } from './learning-journey-view'

/* ---------- props ---------- */

export interface GraduationPanelProps {
  result: GraduationCheckResult
  goalSummary: string
  planTitle: string | null
  planId?: string | null
  trackId?: string | null
  trackName?: string | null
  onDismiss?: () => void
  onStartNewGoal?: (goal: string) => void
  goalHistory?: GoalHistory[]
}

/* ---------- types ---------- */

interface IssuedCertificate {
  id: string
  learner_name: string | null
}

/* ---------- component ---------- */

export function GraduationPanel({
  result,
  goalSummary,
  planTitle,
  planId,
  trackId,
  trackName,
  onDismiss,
  onStartNewGoal,
  goalHistory,
}: GraduationPanelProps) {
  const metCount = result.criteria.filter((c) => c.met).length
  const totalCriteria = result.criteria.length
  const criteriaPercent = totalCriteria > 0 ? (metCount / totalCriteria) * 100 : 0

  const [issuedCert, setIssuedCert] = useState<IssuedCertificate | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [pdfGenerating, setPdfGenerating] = useState(false)

  const metCriteria = result.criteria.filter((c) => c.met)

  /** Issue certificate to DB and download PDF */
  const handleDownloadPdf = useCallback(async () => {
    if (!result.graduated) return

    try {
      // Step 1: Issue certificate if not already issued
      let certId = issuedCert?.id
      let learnerName = issuedCert?.learner_name ?? null

      if (!certId) {
        setIssuing(true)
        const issueRes = await fetch('/api/certificate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_id: planId ?? 'unknown',
            track_id: trackId ?? undefined,
            goal_summary: goalSummary,
            plan_title: planTitle,
            completed_at: result.completedAt ?? new Date().toISOString(),
            milestone_count: result.completedMilestoneCount,
            criteria_labels: metCriteria.map((c) => c.criterion.label),
            artifact_urls: [],
            ai_tools_used: [],
          }),
        })

        if (!issueRes.ok) throw new Error('Certificate issue failed')

        const { certificate } = (await issueRes.json()) as {
          certificate: { id: string; learner_name: string | null }
        }
        certId = certificate.id
        learnerName = certificate.learner_name
        setIssuedCert({ id: certId, learner_name: learnerName })
        setIssuing(false)
      }

      // Step 2: Generate PDF client-side
      setPdfGenerating(true)

      const [{ pdf }, { CertificatePDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/certificate/certificate-pdf'),
      ])

      const verificationUrl = `${window.location.origin}/api/certificate/${certId}`

      const blob = await pdf(
        CertificatePDF({
          data: {
            certificateId: certId,
            learnerName,
            goalSummary,
            planTitle,
            trackName: trackName ?? trackId ?? null,
            completedAt: result.completedAt ?? new Date().toISOString(),
            milestoneCount: result.completedMilestoneCount,
            criteriaLabels: metCriteria.map((c) => c.criterion.label),
            artifactUrls: [],
            aiToolsUsed: [],
            verificationUrl,
          },
        }),
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `graduation-certificate-${certId.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Fallback to text certificate
      const cert = buildCertificateText(goalSummary, planTitle, result)
      const blob = new Blob([cert], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'graduation-certificate.txt'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIssuing(false)
      setPdfGenerating(false)
    }
  }, [result, goalSummary, planTitle, planId, trackId, trackName, metCriteria, issuedCert])

  const verificationUrl = issuedCert
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/certificate/${issuedCert.id}`
    : null

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <section
        className={`rounded-[26px] border p-6 ${
          result.graduated
            ? 'border-amber-300 bg-[linear-gradient(135deg,#fffbeb_0%,#fef3c7_50%,#fde68a_100%)] dark:border-amber-500/40 dark:bg-[linear-gradient(135deg,rgba(251,191,36,0.15)_0%,rgba(245,158,11,0.10)_100%)]'
            : 'border-slate-200 bg-[linear-gradient(135deg,#f0f9ff_0%,#fff7ed_100%)] dark:border-slate-700 dark:bg-[linear-gradient(135deg,rgba(56,189,248,0.10)_0%,rgba(249,115,22,0.10)_100%)]'
        }`}
      >
        <div className="flex items-center gap-3">
          {result.graduated ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/30 dark:bg-amber-500/20">
              <GraduationCap className="h-6 w-6 text-amber-700 dark:text-amber-300" />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-400/20 dark:bg-sky-500/10">
              <Target className="h-6 w-6 text-sky-700 dark:text-sky-300" />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {result.graduated ? '🎉 学習領域完了' : '卒業判定'}
            </p>
            <h2 className="text-xl font-semibold text-overflow-wrap sm:text-2xl">
              {result.graduated ? 'おめでとうございます！' : '卒業基準の確認'}
            </h2>
          </div>
        </div>

        {result.graduated && (
          <p className="mt-3 text-sm leading-6 text-amber-800 dark:text-amber-200">
            すべてのマイルストーンと卒業基準を達成しました。
            あなたは AI を使って real website を作り、公開 URL まで到達できる力を身につけました。
          </p>
        )}

        {/* Milestone progress summary */}
        <div className="mt-5 flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
            <PartyPopper className="h-4 w-4 text-emerald-500" />
            マイルストーン {result.completedMilestoneCount} / {result.totalMilestoneCount}
          </div>
          <div className="h-2.5 flex-1 rounded-full bg-white/80 dark:bg-slate-900/80">
            <motion.div
              className={`h-full rounded-full ${
                result.allMilestonesCompleted
                  ? 'bg-[linear-gradient(90deg,#34d399_0%,#fbbf24_100%)]'
                  : 'bg-[linear-gradient(90deg,#38bdf8_0%,#34d399_100%)]'
              }`}
              initial={{ width: 0 }}
              animate={{
                width: `${result.totalMilestoneCount > 0 ? (result.completedMilestoneCount / result.totalMilestoneCount) * 100 : 0}%`,
              }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Criteria progress */}
        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
            <Award className="h-4 w-4 text-amber-500" />
            卒業基準 {metCount} / {totalCriteria}
          </div>
          <div className="h-2.5 flex-1 rounded-full bg-white/80 dark:bg-slate-900/80">
            <motion.div
              className={`h-full rounded-full ${
                metCount === totalCriteria
                  ? 'bg-[linear-gradient(90deg,#fbbf24_0%,#f59e0b_100%)]'
                  : 'bg-[linear-gradient(90deg,#38bdf8_0%,#818cf8_100%)]'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${criteriaPercent}%` }}
              transition={{ duration: 0.45, ease: 'easeOut', delay: 0.15 }}
            />
          </div>
        </div>
      </section>

      {/* ── Graduation Criteria Checklist ── */}
      <section className="rounded-[26px] border border-slate-200 bg-white/80 p-6 dark:border-slate-700 dark:bg-slate-950/80">
        <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
          卒業基準チェックリスト
        </p>
        <h3 className="mt-2 text-lg font-semibold">{trackName ?? trackId ?? 'web-builder-ai'} 学習領域</h3>

        <div className="mt-4 space-y-3">
          {result.criteria.map((item) => (
            <div
              key={item.criterion.id}
              className={`flex items-start gap-3 rounded-[18px] border p-4 transition ${
                item.met
                  ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5'
                  : 'border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/60'
              }`}
            >
              {item.met ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500 dark:text-slate-600" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    item.met
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {item.criterion.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {item.criterion.description}
                </p>
                {item.met && item.source && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ {item.source}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Completion Certificate ── */}
      {result.graduated && (
        <section className="rounded-[26px] border border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_100%)] p-6 dark:border-amber-500/30 dark:bg-[linear-gradient(135deg,rgba(251,191,36,0.08)_0%,rgba(30,30,30,1)_100%)]">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15">
              <GraduationCap className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
              完了証明
            </h3>
            <p className="mt-1 text-xs font-semibold tracking-[0.18em] text-amber-600 dark:text-amber-400">
              CERTIFICATE OF COMPLETION
            </p>
            <div className="mt-4 w-full max-w-md rounded-[18px] border border-amber-200 bg-white/90 p-5 dark:border-amber-500/20 dark:bg-slate-900/80">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {goalSummary}
              </p>
              {planTitle && (
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  プラン: {planTitle}
                </p>
              )}
              <div className="mt-3 border-t border-amber-100 pt-3 dark:border-amber-500/10">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  達成日: {result.completedAt ? new Date(result.completedAt).toLocaleDateString('ja-JP') : '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  マイルストーン: {result.completedMilestoneCount} / {result.totalMilestoneCount} 完了
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  卒業基準: {metCount} / {totalCriteria} 達成
                </p>
              </div>
            </div>

            {/* PDF Download Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={issuing || pdfGenerating}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
            >
              {issuing || pdfGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {issuing
                ? '証明書を発行中...'
                : pdfGenerating
                  ? 'PDF 生成中...'
                  : 'PDF 証明書をダウンロード'}
            </button>

            {/* Verification URL (shown after certificate is issued) */}
            {verificationUrl && (
              <a
                href={verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-600 underline underline-offset-4 transition hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
              >
                <ExternalLink className="h-3 w-3" />
                オンライン検証 URL
              </a>
            )}

            {/* Share buttons (shown after certificate is issued) */}
            {issuedCert && (
              <div className="mt-5 border-t border-amber-100 pt-5 dark:border-amber-500/10">
                <ShareButtons
                  certificateId={issuedCert.id}
                  goalSummary={goalSummary}
                  trackName={trackName ?? trackId}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Next Steps (post-graduation capability suggestions) ── */}
      {result.graduated && onStartNewGoal && (
        <NextStepsSection
          trackId={trackId}
          goalSummary={goalSummary}
          onSelectGoal={onStartNewGoal}
        />
      )}

      {/* ── Learning Journey overview ── */}
      {result.graduated && goalHistory && goalHistory.length > 0 && (
        <LearningJourneyView
          goals={goalHistory}
          currentGoal={goalSummary}
        />
      )}

      {/* ── Dismiss (back to workspace) ── */}
      {onDismiss && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm text-slate-500 underline underline-offset-4 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ワークスペースに戻る
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------- certificate text builder (fallback) ---------- */

function buildCertificateText(
  goalSummary: string,
  planTitle: string | null,
  result: GraduationCheckResult,
): string {
  const date = result.completedAt
    ? new Date(result.completedAt).toLocaleDateString('ja-JP')
    : new Date().toLocaleDateString('ja-JP')

  const metCriteria = result.criteria.filter((c) => c.met)

  return [
    '================================================',
    '          CERTIFICATE OF COMPLETION',
    '              完了証明書',
    '================================================',
    '',
    `ゴール: ${goalSummary}`,
    planTitle ? `プラン: ${planTitle}` : '',
    `達成日: ${date}`,
    '',
    `マイルストーン: ${result.completedMilestoneCount} / ${result.totalMilestoneCount} 完了`,
    '',
    '── 達成した卒業基準 ──',
    ...metCriteria.map(
      (c) => `  ✓ ${c.criterion.label}${c.source ? ` (${c.source})` : ''}`
    ),
    '',
    '================================================',
    'Powered by School — AI-powered learning platform',
    '================================================',
  ]
    .filter((line) => line !== '')
    .join('\n')
}
