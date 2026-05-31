import { ClipboardList } from 'lucide-react'
import type { RubricBlockContent } from './types'

interface RubricBlockProps {
  content: RubricBlockContent
}

export function RubricBlock({ content }: RubricBlockProps) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/80">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <ClipboardList className="h-4 w-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          評価基準
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {content.criteria.map((criterion, index) => (
          <div key={index} className="px-5 py-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {criterion.label}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
              {criterion.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
