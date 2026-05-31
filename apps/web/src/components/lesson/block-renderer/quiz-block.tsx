'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import type { QuizBlockContent } from './types'

interface QuizBlockProps {
  blockId: string
  content: QuizBlockContent
  onQuizAnswer?: (blockId: string, selectedOptionId: string) => void
}

export function QuizBlock({ blockId, content, onQuizAnswer }: QuizBlockProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)

  function handleSelect(optionId: string) {
    if (revealed) return
    setSelectedId(optionId)
  }

  function handleReveal() {
    if (!selectedId) return
    setRevealed(true)
    onQuizAnswer?.(blockId, selectedId)
  }

  const selectedOption = content.options.find((o) => o.id === selectedId)
  const isCorrect = selectedOption?.correct ?? false

  return (
    <div className="rounded-[24px] border border-indigo-200 bg-white p-5 dark:border-indigo-800 dark:bg-slate-950/80">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-800 dark:text-indigo-200">
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
        クイズ
      </div>
      <p className="mb-4 text-[15px] font-medium leading-7 text-slate-800 dark:text-slate-200">
        {content.question}
      </p>

      <div className="space-y-2" role="radiogroup" aria-label="回答を選択">
        {content.options.map((option) => {
          const isSelected = selectedId === option.id
          let borderClass = 'border-slate-200 dark:border-slate-700'
          let bgClass = 'bg-white dark:bg-slate-950'

          if (revealed && option.correct) {
            borderClass = 'border-emerald-300 dark:border-emerald-700'
            bgClass = 'bg-emerald-50/80 dark:bg-emerald-950/30'
          } else if (revealed && isSelected && !option.correct) {
            borderClass = 'border-red-300 dark:border-red-700'
            bgClass = 'bg-red-50/80 dark:bg-red-950/30'
          } else if (isSelected) {
            borderClass = 'border-indigo-300 dark:border-indigo-600'
            bgClass = 'bg-indigo-50/50 dark:bg-indigo-950/20'
          }

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(option.id)}
              disabled={revealed}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${borderClass} ${bgClass} ${
                revealed ? 'cursor-default' : 'cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-700'
              }`}
            >
              {revealed && option.correct && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              )}
              {revealed && isSelected && !option.correct && (
                <XCircle className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" aria-hidden="true" />
              )}
              {!revealed && (
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500 dark:border-indigo-400 dark:bg-indigo-400'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
              )}
              <span className="text-slate-700 dark:text-slate-300">{option.text}</span>
            </button>
          )
        })}
      </div>

      {!revealed && (
        <button
          type="button"
          onClick={handleReveal}
          disabled={!selectedId}
          className="mt-4 inline-flex items-center rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          回答を確認
        </button>
      )}

      {revealed && (
        <div
          className={`mt-4 rounded-xl p-4 text-sm leading-6 ${
            isCorrect
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200'
          }`}
        >
          <p className="font-semibold">
            {isCorrect ? '正解です!' : '不正解です。'}
          </p>
          {content.explanation && (
            <p className="mt-1 text-slate-700 dark:text-slate-300">{content.explanation}</p>
          )}
        </div>
      )}
    </div>
  )
}
