'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Settings2,
  Terminal,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@school/ui/card'
import {
  type AiToolCatalogEntry,
  getAiToolById,
  resolveAiTools,
} from '@/lib/atoms/ai-tools-catalog'
import { cn } from '@/lib/utils'

interface AiToolLaunchCardProps {
  tools: string[]
}

function AiToolLaunchCard({ tools }: AiToolLaunchCardProps) {
  const availableTools = resolveAiTools(tools)

  const [activeToolId, setActiveToolId] = useState<string | null>(null)
  const [copiedToolId, setCopiedToolId] = useState<string | null>(null)
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false)

  useEffect(() => {
    if (!copiedToolId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedToolId(null)
    }, 2000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [copiedToolId])

  // ── Fallback: no tools selected (wizard skipped or legacy user) ──
  if (availableTools.length === 0) {
    return (
      <Card
        className="border-dashed border-slate-300 bg-card text-foreground dark:border-slate-700"
        data-testid="ai-tool-launch-card-empty"
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Settings2 className="size-5 text-slate-500 dark:text-slate-400" />
            使う AI ツールを選びましょう
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            まだツールを選んでいません。設定からお使いの AI ツールを追加すると、起動手順やコマンドがここに表示されます。
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline dark:text-teal-300"
          >
            設定で追加
            <ExternalLink className="size-3.5" />
          </Link>
        </CardContent>
      </Card>
    )
  }

  const selectedTool: AiToolCatalogEntry =
    (activeToolId ? getAiToolById(activeToolId) : undefined) ?? availableTools[0]
  const secondaryTools = availableTools.filter((tool) => tool.id !== selectedTool.id)

  const handleCopyCommand = async () => {
    if (!selectedTool.command || !navigator.clipboard) {
      return
    }

    try {
      await navigator.clipboard.writeText(selectedTool.command)
      setCopiedToolId(selectedTool.id)
    } catch {
      setCopiedToolId(null)
    }
  }

  return (
    <Card
      className="border-teal-200 bg-card text-foreground dark:border-teal-800"
      data-testid="ai-tool-launch-card"
    >
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Terminal className="size-5 text-teal-600 dark:text-teal-400" />
          AI ツールで始めよう
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold sm:text-base">{selectedTool.label}</p>
              <p className="text-sm text-muted-foreground">{selectedTool.description}</p>
            </div>
            <span className="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
              おすすめ
            </span>
          </div>

          <ol className="mt-4 space-y-3">
            {selectedTool.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-xs font-semibold text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>

          {selectedTool.command && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Command
              </p>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-slate-950 px-4 py-3 text-slate-50 dark:bg-slate-900">
                <code className="text-sm font-medium">{selectedTool.command}</code>
                <button
                  type="button"
                  onClick={() => void handleCopyCommand()}
                  className={cn(
                    'inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-200 transition hover:border-slate-500 hover:text-white',
                    copiedToolId === selectedTool.id && 'border-emerald-500 text-emerald-300',
                  )}
                  aria-label={
                    copiedToolId === selectedTool.id ? 'コピーしました' : 'コマンドをコピー'
                  }
                >
                  {copiedToolId === selectedTool.id ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {selectedTool.homepage && (
            <div className="mt-3">
              <a
                href={selectedTool.homepage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:underline dark:text-teal-300"
              >
                公式サイトを開く
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </div>

        {secondaryTools.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setIsSecondaryOpen((current) => !current)}
              aria-expanded={isSecondaryOpen}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              ほかのツール ({secondaryTools.length})
              <ChevronDown
                className={cn(
                  'size-4 transition-transform',
                  isSecondaryOpen && 'rotate-180',
                )}
              />
            </button>
            {isSecondaryOpen && (
              <div className="space-y-2">
                {secondaryTools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setActiveToolId(tool.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50/60 dark:hover:border-teal-700 dark:hover:bg-teal-950/20"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{tool.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tool.command ? `コマンド: ${tool.command}` : tool.description}
                      </p>
                    </div>
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { AiToolLaunchCard }
export type { AiToolLaunchCardProps }
