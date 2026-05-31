import { notFound } from 'next/navigation'
import { LessonAiChat } from '@/components/lesson/lesson-ai-chat'

/**
 * /dev/sp-chat — TQ-124 SP (mobile) chat harness.
 *
 * Renders `LessonAiChat` in isolation so Playwright can exercise the sticky
 * input, streaming indicator, and suggestion-chip fade-out without standing
 * up a full lesson page. Dev-only (matches /dev/journeys gating) so it never
 * leaks into production.
 */
export const dynamic = 'force-dynamic'

export default async function SpChatHarnessPage({
  searchParams,
}: {
  searchParams?: Promise<{ lessonId?: string; lessonTitle?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const lessonId = resolvedSearchParams?.lessonId?.trim() || 'sp-chat-harness'
  const lessonTitle = resolvedSearchParams?.lessonTitle?.trim() || 'SP chat harness'

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-lg font-semibold">SP chat harness (TQ-124)</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          dev-only harness. Reproduces the planner/chat UI in isolation for
          Playwright mobile viewport assertions.
        </p>
      </header>

      {/* Large filler so the chat form can meaningfully "stick" to the
          viewport bottom on SP. */}
      <div
        aria-hidden="true"
        data-testid="sp-chat-filler"
        className="min-h-[60vh] rounded-lg border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground"
      >
        フィラー: sticky composer の検証に必要な縦スクロール領域です。
      </div>

      <LessonAiChat
        lessonId={lessonId}
        lessonTitle={lessonTitle}
        lessonSummary="TQ-124 readability harness"
      />
    </div>
  )
}
