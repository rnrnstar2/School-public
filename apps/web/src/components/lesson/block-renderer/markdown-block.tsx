'use client'

import { MarkdownRenderer } from '@school/ui/markdown-renderer'
import type { MarkdownBlockContent } from './types'

interface MarkdownBlockProps {
  content: MarkdownBlockContent
}

export function MarkdownBlock({ content }: MarkdownBlockProps) {
  return (
    <div className="text-[15px] leading-8 text-slate-700 dark:text-slate-300 sm:text-base">
      <MarkdownRenderer content={content.text} />
    </div>
  )
}
