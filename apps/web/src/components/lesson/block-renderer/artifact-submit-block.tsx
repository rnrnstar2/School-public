'use client'

import { useState } from 'react'
import { Upload, Link2, FileText, Send, Check } from 'lucide-react'
import type { ArtifactSubmitBlockContent } from './types'

interface ArtifactSubmitBlockProps {
  blockId: string
  content: ArtifactSubmitBlockContent
  onArtifactSubmit?: (blockId: string, content: string, type: string) => void
}

type SubmitMode = 'text' | 'url'

export function ArtifactSubmitBlock({ blockId, content, onArtifactSubmit }: ArtifactSubmitBlockProps) {
  const [mode, setMode] = useState<SubmitMode>('text')
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const acceptsText = content.acceptedTypes.includes('text')
  const acceptsUrl = content.acceptedTypes.includes('url')

  function handleSubmit() {
    if (!value.trim() || submitted) return
    setSubmitted(true)
    onArtifactSubmit?.(blockId, value.trim(), mode)
  }

  return (
    <div className="rounded-[24px] border border-teal-200 bg-white p-5 dark:border-teal-800 dark:bg-slate-950/80">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-teal-800 dark:text-teal-200">
        <Upload className="h-4 w-4" aria-hidden="true" />
        成果物の提出
      </div>
      <p className="mb-4 text-[15px] leading-7 text-slate-700 dark:text-slate-300">
        {content.prompt}
      </p>

      {!submitted ? (
        <>
          {/* Mode tabs (only show if multiple types accepted) */}
          {acceptsText && acceptsUrl && (
            <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'text'}
                onClick={() => setMode('text')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'text'
                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-200'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                テキスト
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'url'}
                onClick={() => setMode('url')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'url'
                    ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-200'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <Link2 className="h-3 w-3" aria-hidden="true" />
                URL
              </button>
            </div>
          )}

          {mode === 'text' ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="成果物のテキストを入力してください..."
              rows={5}
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:placeholder:text-slate-500 dark:focus:border-teal-600"
              aria-label="成果物テキスト"
            />
          ) : (
            <input
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:placeholder:text-slate-500 dark:focus:border-teal-600"
              aria-label="成果物URL"
            />
          )}

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              受付形式: {content.acceptedTypes.join(', ')}
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              提出
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-teal-50 p-4 dark:bg-teal-950/30">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <span className="text-sm font-semibold text-teal-800 dark:text-teal-200">
              提出完了
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-all text-sm leading-6 text-slate-700 dark:text-slate-300">
            {value}
          </p>
        </div>
      )}
    </div>
  )
}
