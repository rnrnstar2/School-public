'use client'

import { useState } from 'react'
import { PenLine, Send } from 'lucide-react'
import type { ReflectionBlockContent } from './types'

interface ReflectionBlockProps {
  blockId: string
  content: ReflectionBlockContent
  personalizedPrompt?: string
  onReflectionSubmit?: (blockId: string, text: string) => void
}

export function ReflectionBlock({
  blockId,
  content,
  personalizedPrompt,
  onReflectionSubmit,
}: ReflectionBlockProps) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const minLength = content.minLength ?? 0
  const isValid = text.trim().length >= minLength
  const prompt = personalizedPrompt ?? content.prompt

  function handleSubmit() {
    if (!isValid || submitted) return
    setSubmitted(true)
    onReflectionSubmit?.(blockId, text.trim())
  }

  return (
    <div className="rounded-[24px] border border-violet-200 bg-white p-5 dark:border-violet-800 dark:bg-slate-950/80">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-800 dark:text-violet-200">
        <PenLine className="h-4 w-4" aria-hidden="true" />
        振り返り
      </div>
      <p className="mb-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-700 dark:text-slate-300">
        {prompt}
      </p>

      {!submitted ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="あなたの考えを書いてください..."
            rows={4}
            className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:placeholder:text-slate-500 dark:focus:border-violet-600"
            aria-label="振り返りを入力"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-slate-400 dark:text-slate-500">
              {minLength > 0 && (
                <span className={text.trim().length >= minLength ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                  {text.trim().length} / {minLength} 文字以上
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              送信
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-violet-50 p-4 dark:bg-violet-950/30">
          <p className="mb-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
            あなたの振り返り
          </p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
            {text}
          </p>
        </div>
      )}
    </div>
  )
}
