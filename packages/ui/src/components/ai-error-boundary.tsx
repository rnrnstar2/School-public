'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface AiErrorBoundaryProps {
  children: ReactNode
  /** Label shown above the error message */
  flowLabel?: string
  /** Called when the user clicks "retry" */
  onRetry?: () => void
}

interface AiErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary that catches render-time errors in AI-powered flows
 * (hearing, plan generation, lesson chat, mentor workspace).
 *
 * Displays a non-destructive fallback UI with retry affordance
 * instead of crashing the entire page.
 */
export class AiErrorBoundary extends Component<AiErrorBoundaryProps, AiErrorBoundaryState> {
  constructor(props: AiErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): AiErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[AiErrorBoundary] ${this.props.flowLabel ?? 'unknown'}:`, error, info.componentStack)
    Sentry.captureException(error, {
      tags: { flow: this.props.flowLabel ?? 'unknown' },
      contexts: { react: { componentStack: info.componentStack ?? undefined } },
    })
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
    this.props.onRetry?.()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const label = this.props.flowLabel ?? 'AI 機能'

    return (
      <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-6 dark:border-rose-900/40 dark:bg-rose-950/30">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
              {label}で予期しないエラーが発生しました
            </p>
            <p className="mt-1 text-xs leading-6 text-rose-700/80 dark:text-rose-300/80">
              {this.state.error?.message || '不明なエラーが発生しました。'}
            </p>
            <p className="mt-2 text-xs text-rose-600/70 dark:text-rose-400/70">
              データは保存済みです。リトライしても問題は発生しません。
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200 dark:hover:bg-rose-900/40"
            >
              <RefreshCw className="h-4 w-4" />
              もう一度試す
            </button>
          </div>
        </div>
      </div>
    )
  }
}
