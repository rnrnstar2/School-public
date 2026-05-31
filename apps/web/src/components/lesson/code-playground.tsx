'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Check, Play, RotateCcw, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react'

interface InteractiveExercise {
  id: string
  title: string
  instruction: string
  language: string
  starterCode: string
  validationPatterns: string[]
  solutionHint?: string | null
}

interface ValidationResult {
  passed: boolean
  matchedPatterns: string[]
  missingPatterns: string[]
}

function validateCode(code: string, patterns: string[]): ValidationResult {
  const matchedPatterns: string[] = []
  const missingPatterns: string[] = []

  for (const pattern of patterns) {
    if (code.includes(pattern)) {
      matchedPatterns.push(pattern)
    } else {
      missingPatterns.push(pattern)
    }
  }

  return {
    passed: missingPatterns.length === 0,
    matchedPatterns,
    missingPatterns,
  }
}

function buildPreviewHtml(code: string, language: string): string {
  if (language === 'html' || language === 'css') {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body { font-family: system-ui, sans-serif; padding: 1rem; }</style>
</head>
<body>${code}</body>
</html>`
  }

  if (language === 'jsx' || language === 'tsx') {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>body { font-family: system-ui, sans-serif; padding: 1rem; } pre.output { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 0.5rem; white-space: pre-wrap; }</style>
</head>
<body>
  <pre class="output"><code>${escapeHtml(code)}</code></pre>
</body>
</html>`
  }

  if (language === 'javascript' || language === 'typescript') {
    const safeCode = code.replace(/<\/script>/g, '<\\/script>')
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <style>body { font-family: monospace; padding: 1rem; background: #1e293b; color: #e2e8f0; } .line { margin: 2px 0; }</style>
</head>
<body>
  <div id="output"></div>
  <script>
    const _out = document.getElementById('output');
    const _log = console.log;
    console.log = function(...args) {
      _log(...args);
      const line = document.createElement('div');
      line.className = 'line';
      line.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      _out.appendChild(line);
    };
    try { ${safeCode} } catch(e) {
      const err = document.createElement('div');
      err.style.color = '#f87171';
      err.textContent = 'Error: ' + e.message;
      _out.appendChild(err);
    }
  </script>
</body>
</html>`
  }

  return `<html><body><pre>${escapeHtml(code)}</pre></body></html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface CodePlaygroundProps {
  exercise: InteractiveExercise
  onComplete?: (exerciseId: string, code: string) => void
}

export function CodePlayground({ exercise, onComplete }: CodePlaygroundProps) {
  const [code, setCode] = useState(exercise.starterCode)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.max(textarea.scrollHeight, 200)}px`
    }
  }, [code])

  const handleRun = useCallback(() => {
    const result = validateCode(code, exercise.validationPatterns)
    setValidation(result)
    setPreviewHtml(buildPreviewHtml(code, exercise.language))

    if (result.passed && !isCompleted) {
      setIsCompleted(true)
      onComplete?.(exercise.id, code)
    }
  }, [code, exercise, isCompleted, onComplete])

  const handleReset = useCallback(() => {
    setCode(exercise.starterCode)
    setPreviewHtml(null)
    setValidation(null)
    setShowHint(false)
  }, [exercise.starterCode])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd + Enter to run
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleRun()
        return
      }

      // Tab support for indentation
      if (e.key === 'Tab') {
        e.preventDefault()
        const textarea = e.currentTarget
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newCode = code.substring(0, start) + '  ' + code.substring(end)
        setCode(newCode)
        // Restore cursor position after state update
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        })
      }
    },
    [code, handleRun]
  )

  return (
    <div className="overflow-hidden rounded-[24px] border border-violet-200 bg-white shadow-lg dark:border-violet-800 dark:bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50/80 px-5 py-3 dark:border-violet-900 dark:bg-violet-950/40">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-violet-900 dark:text-violet-100">
            {exercise.title}
          </span>
        </div>
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-300">
          {exercise.language}
        </span>
      </div>

      {/* Instruction */}
      <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">{exercise.instruction}</p>
      </div>

      {/* Editor */}
      <div className="relative">
        <div className="absolute left-0 top-0 flex h-full w-10 flex-col items-end border-r border-slate-200 bg-slate-50 pr-2 pt-4 text-xs leading-[1.625rem] text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600">
          {code.split('\n').map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="w-full resize-none bg-slate-950 py-4 pl-14 pr-4 font-mono text-sm leading-[1.625rem] text-cyan-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-500"
          style={{ minHeight: 200, tabSize: 2 }}
          aria-label={`${exercise.title} コードエディタ`}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={handleRun}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
          実行する
          <kbd className="ml-1 rounded bg-violet-500/30 px-1.5 py-0.5 text-[10px] font-normal">
            {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}+Enter
          </kbd>
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          リセット
        </button>
        <button
          type="button"
          onClick={() => setShowHint((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
          ヒント
          {showHint ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Hint */}
      {showHint && (
        <div className="border-t border-amber-100 bg-amber-50/50 px-5 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-sm leading-6 text-amber-900 dark:text-amber-100">{exercise.solutionHint}</p>
        </div>
      )}

      {/* Validation Result */}
      {validation && (
        <div
          className={`border-t px-5 py-3 ${
            validation.passed
              ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30'
              : 'border-orange-200 bg-orange-50/80 dark:border-orange-900 dark:bg-orange-950/30'
          }`}
        >
          {validation.passed ? (
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                正解です！すべての条件を満たしています。
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                あと少し！以下の要素が見つかりませんでした:
              </p>
              <ul className="space-y-1">
                {validation.missingPatterns.map((pattern) => (
                  <li key={pattern} className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
                    <code className="rounded bg-orange-100 px-1.5 py-0.5 font-mono text-xs dark:bg-orange-900/50">
                      {pattern}
                    </code>
                  </li>
                ))}
              </ul>
              {validation.matchedPatterns.length > 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  {validation.matchedPatterns.length} / {validation.matchedPatterns.length + validation.missingPatterns.length} 条件クリア
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview iframe */}
      {previewHtml && (
        <div className="border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 bg-slate-100 px-5 py-2 dark:bg-slate-900">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              プレビュー
            </span>
          </div>
          <iframe
            srcDoc={previewHtml}
            title="コードプレビュー"
            sandbox="allow-scripts"
            className="h-64 w-full bg-white"
          />
        </div>
      )}
    </div>
  )
}
