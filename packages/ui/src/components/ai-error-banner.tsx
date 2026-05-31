'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, Loader2, RefreshCw, WifiOff } from 'lucide-react'
import type { AiErrorKind } from '../network-status'

interface AiErrorBannerProps {
  kind: AiErrorKind
  message?: string
  retryCount?: number
  /** True while an automatic retry is pending */
  isRetrying?: boolean
  /** Seconds remaining until the next automatic retry */
  retryCountdownSec?: number
  /** True when all automatic retries have been exhausted */
  retriesExhausted?: boolean
  retryLabel?: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
}

const kindConfig: Record<AiErrorKind, {
  icon: typeof AlertTriangle
  border: string
  bg: string
  text: string
  dot: string
}> = {
  network: {
    icon: WifiOff,
    border: 'border-amber-200 dark:border-amber-900/40',
    bg: 'bg-amber-50/80 dark:bg-amber-950/30',
    text: 'text-amber-800 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  timeout: {
    icon: AlertTriangle,
    border: 'border-orange-200 dark:border-orange-900/40',
    bg: 'bg-orange-50/80 dark:bg-orange-950/30',
    text: 'text-orange-800 dark:text-orange-200',
    dot: 'bg-orange-500',
  },
  server: {
    icon: AlertTriangle,
    border: 'border-rose-200 dark:border-rose-900/40',
    bg: 'bg-rose-50/80 dark:bg-rose-950/30',
    text: 'text-rose-800 dark:text-rose-200',
    dot: 'bg-rose-500',
  },
  unknown: {
    icon: AlertTriangle,
    border: 'border-rose-200 dark:border-rose-900/40',
    bg: 'bg-rose-50/80 dark:bg-rose-950/30',
    text: 'text-rose-800 dark:text-rose-200',
    dot: 'bg-rose-500',
  },
}

export function AiErrorBanner({
  kind,
  message,
  retryCount = 0,
  isRetrying = false,
  retryCountdownSec = 0,
  retriesExhausted = false,
  retryLabel = '再試行',
  onRetry,
  onDismiss,
  className,
}: AiErrorBannerProps) {
  const config = kindConfig[kind]
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={`rounded-2xl border ${config.border} ${config.bg} px-4 py-3 ${className ?? ''}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.text}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${config.text}`}>
            {retriesExhausted
              ? 'AI サーバーへの接続に失敗しました。しばらく待ってから再試行してください。'
              : message}
          </p>

          {isRetrying && (
            <div className="mt-1.5 flex items-center gap-2">
              <Loader2 className={`h-3 w-3 animate-spin ${config.text}`} />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {retryCountdownSec > 0
                  ? `自動リトライ中... ${retryCountdownSec}秒後に再試行（${retryCount}/3回目）`
                  : '再試行中...'}
              </p>
            </div>
          )}

          {!isRetrying && retryCount > 0 && !retriesExhausted && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              リトライ回数: {retryCount}
            </p>
          )}

          {retriesExhausted && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              自動リトライ {retryCount} 回すべて失敗しました
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {onRetry && !isRetrying && (
            <button
              type="button"
              onClick={onRetry}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${config.border} ${config.text} hover:opacity-80`}
            >
              <RefreshCw className="h-3 w-3" />
              {retryLabel}
            </button>
          )}
          {onDismiss && !isRetrying && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-xl px-2 py-1.5 text-xs text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              閉じる
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
