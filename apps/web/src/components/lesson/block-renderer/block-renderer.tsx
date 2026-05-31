'use client'

import type { ComponentType } from 'react'
import type { LessonBlock, LessonBlockType } from '@/types/domain'
import { cn } from '@/lib/utils'
import { MarkdownBlock } from './markdown-block'
import { ImageBlock } from './image-block'
import { VideoBlock } from './video-block'
import { ChecklistBlock } from './checklist-block'
import { QuizBlock } from './quiz-block'
import { CodePromptBlock } from './code-prompt-block'
import { ReflectionBlock } from './reflection-block'
import { RubricBlock } from './rubric-block'
import { CalloutBlock } from './callout-block'
import { ArtifactSubmitBlock } from './artifact-submit-block'
import type {
  MarkdownBlockContent,
  ImageBlockContent,
  VideoBlockContent,
  ChecklistBlockContent,
  QuizBlockContent,
  CodePromptBlockContent,
  ReflectionBlockContent,
  RubricBlockContent,
  CalloutBlockContent,
  ArtifactSubmitBlockContent,
} from './types'

// ============================================
// Block renderer dispatch map
// ============================================

// Each entry maps a block type to its renderer.
// Renderers for interactive blocks receive callback props via the wrapper.
type SimpleBlockRenderer = ComponentType<{ content: Record<string, unknown> }>

const SIMPLE_BLOCK_RENDERERS: Partial<Record<LessonBlockType, SimpleBlockRenderer>> = {
  markdown: MarkdownBlock as unknown as SimpleBlockRenderer,
  image: ImageBlock as unknown as SimpleBlockRenderer,
  video: VideoBlock as unknown as SimpleBlockRenderer,
  code_prompt: CodePromptBlock as unknown as SimpleBlockRenderer,
  rubric: RubricBlock as unknown as SimpleBlockRenderer,
  callout: CalloutBlock as unknown as SimpleBlockRenderer,
}

// ============================================
// BlockRenderer component
// ============================================

export interface BlockRendererProps {
  blocks: LessonBlock[]
  onChecklistChange?: (blockId: string, itemId: string, checked: boolean) => void
  onQuizAnswer?: (blockId: string, selectedOptionId: string) => void
  onReflectionSubmit?: (blockId: string, text: string) => void
  onArtifactSubmit?: (blockId: string, content: string, type: string) => void
  className?: string
}

export function BlockRenderer({
  blocks,
  onChecklistChange,
  onQuizAnswer,
  onReflectionSubmit,
  onArtifactSubmit,
  className,
}: BlockRendererProps) {
  const sortedBlocks = [...blocks].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className={cn('space-y-6', className)}>
      {sortedBlocks.map((block) => {
        const content = block.content as Record<string, unknown>

        // Interactive blocks that need callback props
        switch (block.type) {
          case 'checklist':
            return (
              <ChecklistBlock
                key={block.id}
                blockId={block.id}
                content={content as unknown as ChecklistBlockContent}
                onChecklistChange={onChecklistChange}
              />
            )
          case 'quiz':
            return (
              <QuizBlock
                key={block.id}
                blockId={block.id}
                content={content as unknown as QuizBlockContent}
                onQuizAnswer={onQuizAnswer}
              />
            )
          case 'reflection':
            return (
              <ReflectionBlock
                key={block.id}
                blockId={block.id}
                content={content as unknown as ReflectionBlockContent}
                onReflectionSubmit={onReflectionSubmit}
              />
            )
          case 'artifact_submit':
            return (
              <ArtifactSubmitBlock
                key={block.id}
                blockId={block.id}
                content={content as unknown as ArtifactSubmitBlockContent}
                onArtifactSubmit={onArtifactSubmit}
              />
            )
          default: {
            // Simple blocks (no callback props needed)
            const Renderer = SIMPLE_BLOCK_RENDERERS[block.type]
            if (Renderer) {
              return <Renderer key={block.id} content={content} />
            }

            // Unknown block type — render nothing but warn in dev
            if (process.env.NODE_ENV === 'development') {
              return (
                <div
                  key={block.id}
                  className="rounded-xl border border-dashed border-red-300 bg-red-50 p-4 text-sm text-red-600 dark:border-red-700 dark:bg-red-950/20 dark:text-red-400"
                >
                  未対応のブロックタイプ: <code>{block.type}</code>
                </div>
              )
            }
            return null
          }
        }
      })}
    </div>
  )
}
