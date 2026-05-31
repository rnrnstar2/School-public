'use client'

import Image from 'next/image'
import { ImageOff, RefreshCw } from 'lucide-react'
import { useState, useCallback } from 'react'
import type { ImageBlockContent } from './types'

function isGif(src: string): boolean {
  return /\.gif(\?.*)?$/i.test(src)
}

interface ImageBlockProps {
  content: ImageBlockContent
}

export function ImageBlock({ content }: ImageBlockProps) {
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const handleRetry = useCallback(() => {
    setError(false)
    setRetryKey((k) => k + 1)
  }, [])

  if (error) {
    return (
      <figure className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700">
        <div
          className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 py-10 dark:border-slate-700 dark:bg-slate-900"
          role="alert"
        >
          <ImageOff className="h-10 w-10 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {content.alt || '画像を読み込めませんでした'}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            リトライ
          </button>
        </div>
      </figure>
    )
  }

  return (
    <figure className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700">
      <Image
        key={retryKey}
        src={content.src}
        alt={content.alt}
        width={content.width ?? 1200}
        height={content.height ?? 675}
        unoptimized={isGif(content.src)}
        className="h-auto w-full object-cover"
        onError={() => setError(true)}
      />
      {content.caption && (
        <figcaption className="px-4 py-3 text-center text-sm text-slate-500 dark:text-slate-400">
          {content.caption}
        </figcaption>
      )}
    </figure>
  )
}
