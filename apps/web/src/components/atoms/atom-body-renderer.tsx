import { Card, CardContent, CardHeader, CardTitle } from '@school/ui/card'
import { MarkdownRenderer } from '@school/ui/markdown-renderer'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { ReflectionBlock } from '@/components/lesson/block-renderer/reflection-block'
import {
  DELIVERABLE_GLOSSARY,
  EVIDENCE_GLOSSARY,
  MEDIA_GLOSSARY,
  type GlossaryEntry,
} from '@/lib/atoms/capability-glossary'
import type { AtomViewModel } from '@/lib/atoms/atom-view-model'
import { buildReflectionPrompt } from '@/lib/lessons/reflection-prompt-builder'

const DEFAULT_REFLECTION_PROMPT =
  '今回の学びを振り返り、うまくいった点と次に改善したい点を整理してみましょう。'

function stripReflectionMarkdown(line: string) {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^\s*\[[ xX]\]\s+/, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '')
    .trim()
}

function resolveReflectionAtomPrompt(markdown: string) {
  const promptLines = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => stripReflectionMarkdown(line))
    .filter(Boolean)

  const firstPromptLine = promptLines[0]

  if (!firstPromptLine) {
    return DEFAULT_REFLECTION_PROMPT
  }

  const looksLikeTemplateLabel =
    promptLines.length > 1 && /[:：]$/.test(firstPromptLine) && firstPromptLine.length <= 12

  return looksLikeTemplateLabel ? DEFAULT_REFLECTION_PROMPT : firstPromptLine
}

function BadgeGroup({
  label,
  values,
  fallback,
  glossary,
}: {
  label: string
  values: string[]
  fallback: string
  glossary?: GlossaryEntry
}) {
  return (
    <div className="space-y-2">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        {label}
        {glossary && (
          <InfoTooltip
            ariaLabel={`${glossary.term} とは何かを表示`}
            heading={glossary.term}
            description={glossary.description}
          />
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {(values.length > 0 ? values : [fallback]).map((value) => (
          <span
            key={`${label}-${value}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

export function AtomBodyRenderer({
  atom,
  learnerBlockers,
  recentFeedback,
}: {
  atom: Pick<AtomViewModel, 'sections' | 'deliverable' | 'evidence' | 'mediaSlots'>
  learnerBlockers?: string[]
  recentFeedback?: string | null
}) {
  return (
    <div className="space-y-5">
      <Card className="border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">学習メモ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <BadgeGroup
            label="成果物"
            values={[
              atom.deliverable.type ? `種類: ${atom.deliverable.type}` : '',
              atom.deliverable.validation ? `検証: ${atom.deliverable.validation}` : '',
            ].filter(Boolean)}
            fallback="未設定"
            glossary={DELIVERABLE_GLOSSARY}
          />
          <BadgeGroup
            label="証跡"
            values={atom.evidence}
            fallback="未設定"
            glossary={EVIDENCE_GLOSSARY}
          />
          <BadgeGroup
            label="メディア"
            values={atom.mediaSlots}
            fallback="未設定"
            glossary={MEDIA_GLOSSARY}
          />
        </CardContent>
      </Card>

      {atom.sections.map((section, index) => {
        const isReflectionSection = /^振り返り(?:[\s　：:・]|$)/.test(section.title.trim())
        const hasPersonalization = Boolean(
          recentFeedback?.trim() || learnerBlockers?.some((blocker) => blocker.trim()),
        )
        const personalizedPrompt =
          isReflectionSection && hasPersonalization
            ? buildReflectionPrompt({
                atomPrompt: resolveReflectionAtomPrompt(section.markdown),
                blockers: learnerBlockers,
                recentFeedback,
              })
            : undefined

        return (
          <Card
            key={`${section.id}-${section.title}-${index}`}
            className="border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80"
          >
            <CardHeader className="pb-4">
              <h2 className="text-lg font-semibold">{section.title}</h2>
            </CardHeader>
            <CardContent className={personalizedPrompt ? 'space-y-4' : undefined}>
              {personalizedPrompt && (
                <ReflectionBlock
                  blockId={`reflection-${section.id}-${index}`}
                  content={{ prompt: section.markdown }}
                  personalizedPrompt={personalizedPrompt}
                />
              )}
              <MarkdownRenderer
                content={section.markdown}
                className="prose prose-slate max-w-none text-sm leading-7 dark:prose-invert"
              />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
