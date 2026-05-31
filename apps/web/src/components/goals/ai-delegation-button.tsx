'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bot, Check, Copy, LoaderCircle, Sparkles, X } from 'lucide-react'

import { Button } from '@school/ui/button'
import { cn } from '@/lib/utils'
import type { GoalTreeOwnerType } from '@/types/goal-tree'

type DelegateKind =
  | 'prompt'
  | 'code_brief'
  | 'analyze'
  | 'codex_cli_brief'
  | 'claude_code_brief'

interface AiDelegationButtonProps {
  goalId: string
  nodeId: string
  nodeLabel: string
  ownerType: GoalTreeOwnerType
  nodeType?: string
  className?: string
}

type DelegateResult = {
  brief: string
  contextId: string
  kind: DelegateKind
}

const KIND_OPTIONS: Array<{
  kind: DelegateKind
  title: string
  description: string
}> = [
  {
    kind: 'prompt',
    title: 'Prompt',
    description: 'そのまま別 AI に貼る委譲 prompt を作る',
  },
  {
    kind: 'code_brief',
    title: 'Code Brief',
    description: '実装方針と確認ポイントを整理する',
  },
  {
    kind: 'analyze',
    title: 'Analyze',
    description: '詰まり原因の仮説と切り分けを作る',
  },
  {
    kind: 'codex_cli_brief',
    title: 'Codex CLI 用 brief を生成',
    description: 'Codex CLI に貼れる実装 brief を具体コマンド付きで作る',
  },
  {
    kind: 'claude_code_brief',
    title: 'Claude Code 用 brief を生成',
    description: 'Claude Code に貼れる context / hints / checkpoint を作る',
  },
]

function canDelegate(ownerType: GoalTreeOwnerType, nodeType: string | undefined) {
  return (ownerType === 'ai' || ownerType === 'both') && (nodeType === 'task' || nodeType === 'sub_task')
}

function isPlaywrightBrowser() {
  return typeof navigator !== 'undefined' && navigator.webdriver
}

function isAgentBrief(kind: DelegateKind) {
  return kind === 'codex_cli_brief' || kind === 'claude_code_brief'
}

function goalContextAnchor(kind: DelegateKind) {
  return isAgentBrief(kind) ? 'agent-delegation-briefs' : 'ai-delegation-briefs'
}

function AiDelegationButton({
  goalId,
  nodeId,
  nodeLabel,
  ownerType,
  nodeType = 'task',
  className,
}: AiDelegationButtonProps) {
  const [open, setOpen] = useState(false)
  const [pendingKind, setPendingKind] = useState<DelegateKind | null>(null)
  const [result, setResult] = useState<DelegateResult | null>(null)
  const [copiedContextId, setCopiedContextId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toast, setToast] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onEscape)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null)
    }, 3500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toast])

  useEffect(() => {
    if (!copiedContextId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedContextId(null)
    }, 2000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [copiedContextId])

  if (!canDelegate(ownerType, nodeType)) {
    return null
  }

  const handleDelegate = async (kind: DelegateKind) => {
    try {
      setPendingKind(kind)
      setCopiedContextId(null)
      setErrorMessage(null)

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (isPlaywrightBrowser()) {
        headers['x-ai-delegation-mode'] = 'mock'
      }

      const response = await fetch(`/api/goals/${goalId}/nodes/${nodeId}/delegate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ delegateKind: kind }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.ok) {
        const message = typeof payload?.message === 'string'
          ? payload.message
          : 'brief の生成に失敗しました。'
        throw new Error(message)
      }

      setResult({
        brief: payload.brief,
        contextId: payload.contextId,
        kind,
      })
      setToast({
        tone: 'success',
        message: 'delegation brief を保存しました。',
      })
      setOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'brief の生成に失敗しました。'
      setErrorMessage(message)
      setToast({
        tone: 'error',
        message,
      })
      setOpen(true)
    } finally {
      setPendingKind(null)
    }
  }

  const handleCopyBrief = async () => {
    if (!result) {
      return
    }

    try {
      await navigator.clipboard.writeText(result.brief)
      setCopiedContextId(result.contextId)
      setToast({
        tone: 'success',
        message: 'コピーしました',
      })
    } catch {
      setToast({
        tone: 'error',
        message: 'clipboard へのコピーに失敗しました。',
      })
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid={`ai-delegation-trigger-${nodeId}`}
        className="min-h-11 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200"
      >
        <Bot className="mr-1 size-4" />
        AI に任せる
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label={`${nodeLabel} の AI delegation`}
          data-testid={`ai-delegation-popover-${nodeId}`}
          className="theme-popover absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/70 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-300">
                AI Delegation
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">{nodeLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="AI delegation を閉じる"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <p className="text-sm leading-6 text-muted-foreground">
              brief の種類を選ぶと、この task 用の artifact を `goal_contexts` に保存します。
            </p>

            <div className="space-y-2">
              {KIND_OPTIONS.map((option) => {
                const pending = pendingKind === option.kind

                return (
                  <button
                    key={option.kind}
                    type="button"
                    onClick={() => void handleDelegate(option.kind)}
                    disabled={Boolean(pendingKind)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background/80 px-3 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-70 dark:hover:border-sky-800 dark:hover:bg-sky-950/20"
                    data-testid={`ai-delegation-option-${option.kind}-${nodeId}`}
                  >
                    <div className="mt-0.5 rounded-full bg-sky-100 p-2 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
                      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{option.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                {errorMessage}
              </div>
            ) : null}

            {result ? (
              <div
                className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                data-testid={`ai-delegation-result-${nodeId}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {KIND_OPTIONS.find((option) => option.kind === result.kind)?.title} brief
                    </p>
                    <span className="text-xs text-muted-foreground">context #{result.contextId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyBrief()}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                      copiedContextId === result.contextId
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'border-emerald-200 bg-background/80 text-foreground hover:border-emerald-300 hover:bg-background dark:border-emerald-900/60',
                    )}
                    data-testid={`ai-delegation-copy-${nodeId}`}
                    aria-label={copiedContextId === result.contextId ? 'コピーしました' : 'brief をコピー'}
                  >
                    {copiedContextId === result.contextId ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copiedContextId === result.contextId ? 'コピーしました' : 'コピー'}
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {result.brief}
                </p>
                <div className="mt-3">
                  <Link
                    href={`/goals/${goalId}#${goalContextAnchor(result.kind)}`}
                    className="text-sm font-semibold text-primary underline underline-offset-4"
                  >
                    goal context で確認
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-lg',
            toast.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200',
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  )
}

export { AiDelegationButton }
export type { AiDelegationButtonProps }
