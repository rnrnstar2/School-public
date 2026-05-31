'use client'

import { useState } from 'react'
import { Code2, Eye, EyeOff, Copy, Check } from 'lucide-react'
import type { CodePromptBlockContent } from './types'

interface CodePromptBlockProps {
  content: CodePromptBlockContent
}

export function CodePromptBlock({ content }: CodePromptBlockProps) {
  const [showSolution, setShowSolution] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  const displayCode = content.starterCode ?? ''

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950 shadow-lg shadow-slate-950/10 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{content.language}</span>
        </div>
        {displayCode && (
          <button
            type="button"
            onClick={() => void handleCopy(displayCode)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
            aria-label="コードをコピー"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" aria-hidden="true" />
                コピー済み
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" aria-hidden="true" />
                コピー
              </>
            )}
          </button>
        )}
      </div>

      {/* Prompt */}
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-sm leading-6 text-slate-300">{content.prompt}</p>
      </div>

      {/* Starter code */}
      {displayCode && (
        <pre className="overflow-x-auto p-4 text-sm leading-7 text-cyan-100">
          <code>{displayCode}</code>
        </pre>
      )}

      {/* Solution toggle */}
      {content.solution && (
        <div className="border-t border-white/10">
          <button
            type="button"
            onClick={() => setShowSolution((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            {showSolution ? (
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {showSolution ? '解答を隠す' : '解答を表示'}
          </button>
          {showSolution && (
            <pre className="overflow-x-auto border-t border-white/10 bg-emerald-950/20 p-4 text-sm leading-7 text-emerald-200">
              <code>{content.solution}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
