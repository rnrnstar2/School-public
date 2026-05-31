'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'

export function PreviewModeBadge() {
  return (
    <Link
      href="/signup"
      className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
      aria-label="プレビューモード — 登録するとデータを保存できます"
    >
      <Eye className="h-3 w-3" aria-hidden="true" />
      <span>プレビューモード</span>
    </Link>
  )
}
