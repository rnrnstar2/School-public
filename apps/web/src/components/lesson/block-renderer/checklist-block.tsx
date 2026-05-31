'use client'

import { useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import type { ChecklistBlockContent } from './types'

interface ChecklistBlockProps {
  blockId: string
  content: ChecklistBlockContent
  onChecklistChange?: (blockId: string, itemId: string, checked: boolean) => void
}

export function ChecklistBlock({ blockId, content, onChecklistChange }: ChecklistBlockProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})

  function handleToggle(itemId: string) {
    const newChecked = !checkedItems[itemId]
    setCheckedItems((prev) => ({ ...prev, [itemId]: newChecked }))
    onChecklistChange?.(blockId, itemId, newChecked)
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/80">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
        <CheckSquare className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
        チェックリスト
      </div>
      <ul className="space-y-2" role="list">
        {content.items.map((item) => {
          const isChecked = !!checkedItems[item.id]
          return (
            <li key={item.id}>
              <label
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 px-4 py-3 transition hover:border-slate-200 dark:border-slate-800 dark:hover:border-slate-700"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  onClick={() => handleToggle(item.id)}
                  className="mt-0.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                >
                  {isChecked ? (
                    <CheckSquare className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  ) : (
                    <Square className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  )}
                </button>
                <span
                  className={`text-sm leading-6 ${
                    isChecked
                      ? 'text-slate-400 line-through dark:text-slate-500'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {item.label}
                  {item.required && (
                    <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                      必須
                    </span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
