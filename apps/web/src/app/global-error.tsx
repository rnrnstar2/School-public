'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Root-level error boundary for unhandled errors.
 * Next.js App Router renders this when an error is thrown in the root layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ja">
      <body className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg dark:border-red-900/40 dark:bg-gray-900">
          <h1 className="text-lg font-bold text-red-700 dark:text-red-300">
            予期しないエラーが発生しました
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {error.message || 'アプリケーションに問題が発生しました。'}
          </p>
          {error.digest && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              エラーID: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-xl bg-red-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
          >
            もう一度試す
          </button>
        </div>
      </body>
    </html>
  )
}
