'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CompiledPlanPage } from '@/components/plan/compiled-plan-page'
import { attachBridgeQuestionToNextAction } from '@/lib/planner/goal-first/bridge-question'
import { resolveNextAction } from '@/lib/planner/goal-first/next-action-resolver'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'
import type { NextAction } from '@/lib/planner/goal-first/types'
import { Button } from '@school/ui/button'

interface PreviewState {
  plan: AtomCompiledPlan
  goal: string
  tools?: string[]
  compiledAt: string
}

export function PreviewPlanClient() {
  const router = useRouter()
  const [state, setState] = useState<PreviewState | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('school:preview:plan')
      if (raw) {
        const parsed = JSON.parse(raw) as PreviewState
        if (parsed.plan && Array.isArray(parsed.plan.steps)) {
          setState(parsed)
        }
      }
    } catch (e) {
      console.warn('プレビュープラン読込失敗', e)
    } finally {
      setLoaded(true)
    }
  }, [])

  const handleStartLesson = useCallback(
    (lessonId: string) => {
      router.push(`/lessons/${lessonId}`)
    },
    [router],
  )

  const handleViewEvidence = useCallback(() => {
    router.push('/signup?next=/plan')
  }, [router])

  if (!loaded) {
    return (
      <div className="theme-page-shell min-h-[calc(100vh-4rem)] px-4 py-12">
        <div className="mx-auto max-w-2xl text-center text-sm text-muted-foreground">
          プランを読み込んでいます...
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="theme-page-shell min-h-[calc(100vh-4rem)] px-4 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-xl font-semibold">プレビュープランが見つかりません</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            ゴールを入力してプランを生成してください。
          </p>
          <Link href="/plan/onboarding" className="mt-6 inline-block">
            <Button>ゴールを入力する</Button>
          </Link>
        </div>
      </div>
    )
  }

  const completedNodeIds = state.plan.steps
    .filter((step) => step.completedAt)
    .map((step) => step.atomId)
  const nextAction: NextAction = attachBridgeQuestionToNextAction(
    resolveNextAction(state.plan, completedNodeIds),
    { goalText: state.goal },
  )

  return (
    <div className="theme-page-shell min-h-[calc(100vh-4rem)]">
      <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
        <span className="font-medium">プレビューモード</span>
        <span className="mx-2">·</span>
        <span>このプランはまだ保存されていません。</span>
        <Link
          href="/signup?next=/plan"
          className="ml-2 underline underline-offset-2 hover:no-underline"
        >
          登録して保存する
        </Link>
      </div>

      <CompiledPlanPage
        plan={state.plan}
        nextAction={nextAction}
        completedNodeIds={completedNodeIds}
        preferredTools={state.tools ?? []}
        goalSummary={state.goal}
        onStartLesson={handleStartLesson}
        onViewEvidence={handleViewEvidence}
      />
    </div>
  )
}
