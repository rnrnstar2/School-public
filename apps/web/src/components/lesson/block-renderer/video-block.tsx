'use client'

import { VideoPlayer } from '@/components/lesson/video-player'
import type { VideoBlockContent } from './types'

interface VideoBlockProps {
  content: VideoBlockContent
}

export function VideoBlock({ content }: VideoBlockProps) {
  return (
    <figure className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700">
      <VideoPlayer url={content.src} title={content.caption ?? undefined} />
      {content.caption && (
        <figcaption className="px-4 py-3 text-center text-sm text-slate-500 dark:text-slate-400">
          {content.caption}
        </figcaption>
      )}
    </figure>
  )
}
