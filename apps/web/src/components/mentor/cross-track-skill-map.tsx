'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  GitMerge,
  SkipForward,
} from 'lucide-react'
import type { CrossTrackSkillAnalysis, SharedSkill } from '@/lib/curriculum/multi-track'

export interface CrossTrackSkillMapProps {
  analysis: CrossTrackSkillAnalysis
  trackLabels: Record<string, string>
}

/** Human-readable labels for common capability tags */
const SKILL_LABELS: Record<string, string> = {
  'tooling-setup': 'ツールセットアップ',
  'local-development': 'ローカル開発',
  'workflow-planning': 'ワークフロー設計',
  'scope-definition': 'スコープ定義',
  'api-call': 'API呼び出し',
  'error-handling': 'エラーハンドリング',
  'prompt-engineering': 'プロンプト設計',
  'ai-conversation': 'AI対話',
  'summarization': '要約',
  'text-generation': 'テキスト生成',
  'python-setup': 'Python環境構築',
  'api-configuration': 'API設定',
  'json-parsing': 'JSON処理',
  'script-writing': 'スクリプト作成',
  'deployment': 'デプロイ',
  'deployment-prep': 'デプロイ準備',
  'version-control': 'バージョン管理',
  'repo-initialization': 'リポジトリ初期化',
}

function getSkillLabel(skill: string): string {
  return SKILL_LABELS[skill] ?? skill.replace(/-/g, ' ')
}

export function CrossTrackSkillMap({ analysis, trackLabels }: CrossTrackSkillMapProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (analysis.sharedSkills.length === 0) return null

  const skippableCount = analysis.skippableLessonIds.length

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white/90 sm:rounded-[24px] dark:border-slate-700 dark:bg-slate-950/80">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-[20px] sm:rounded-[24px]"
      >
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-sky-500" />
          <span className="text-xs font-semibold tracking-[0.18em] text-slate-500 dark:text-slate-400">
            共通スキルマップ
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200">
            {analysis.sharedSkills.length}スキル
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-700">
              {/* Skip hint */}
              {skippableCount > 0 && (
                <div className="flex items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                  <SkipForward className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-200">
                    他トラックで習得済みのスキルにより、<strong>{skippableCount}レッスン</strong>をスキップ可能
                  </p>
                </div>
              )}

              {/* Skill list */}
              <div className="space-y-2">
                {analysis.sharedSkills.slice(0, 8).map((skill) => (
                  <SkillRow key={skill.skill} skill={skill} trackLabels={trackLabels} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SkillRow({ skill, trackLabels }: { skill: SharedSkill; trackLabels: Record<string, string> }) {
  const totalLessons = skill.lessonIds.length
  const completedCount = skill.completedLessonIds.length
  const isFullyCompleted = completedCount >= totalLessons

  return (
    <div className="rounded-[14px] border border-slate-100 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {getSkillLabel(skill.skill)}
        </p>
        {isFullyCompleted ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
            習得済み
          </span>
        ) : (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {completedCount}/{totalLessons}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {skill.trackIds.map((trackId) => (
          <span
            key={trackId}
            className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          >
            {trackLabels[trackId] ?? trackId}
          </span>
        ))}
      </div>
    </div>
  )
}
