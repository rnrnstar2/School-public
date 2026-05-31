'use client'

import Image from 'next/image'
import { Play, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'
import { useState } from 'react'

function parseVideoUrl(url: string): { type: 'youtube'; videoId: string } | { type: 'vimeo'; videoId: string } | { type: 'direct'; url: string } {
  // YouTube: various URL formats
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )
  if (ytMatch) {
    return { type: 'youtube', videoId: ytMatch[1] }
  }

  // Vimeo
  const vimeoMatch = url.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/)
  if (vimeoMatch) {
    return { type: 'vimeo', videoId: vimeoMatch[1] }
  }

  return { type: 'direct', url }
}

function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

function VideoErrorFallback({ url, title, onRetry }: { url: string; title?: string; onRetry: () => void }) {
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-4 bg-slate-100 dark:bg-slate-900"
      role="alert"
    >
      <AlertTriangle className="h-10 w-10 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
        動画を読み込めませんでした
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          リトライ
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          URLを開く
        </a>
      </div>
    </div>
  )
}

export function VideoPlayer({ url, title }: { url: string; title?: string }) {
  const parsed = parseVideoUrl(url)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  function handleRetry() {
    setError(false)
    setRetryKey((k) => k + 1)
  }

  if (parsed.type === 'youtube') {
    if (error) {
      return <VideoErrorFallback url={url} title={title} onRetry={handleRetry} />
    }

    if (!playing) {
      return (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative aspect-video w-full overflow-hidden bg-slate-950"
          aria-label={title ? `${title} を再生` : '動画を再生'}
        >
          <Image
            src={getYouTubeThumbnail(parsed.videoId)}
            alt={title ?? '動画サムネイル'}
            fill
            sizes="(max-width: 768px) 100vw, 800px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setError(true)}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
              <Play className="h-7 w-7 text-slate-950" fill="currentColor" />
            </div>
          </div>
        </button>
      )
    }

    return (
      <div className="aspect-video w-full bg-slate-950">
        <iframe
          src={`https://www.youtube.com/embed/${parsed.videoId}?autoplay=1&rel=0`}
          title={title ?? '動画'}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  if (parsed.type === 'vimeo') {
    return (
      <div className="aspect-video w-full bg-slate-950">
        <iframe
          src={`https://player.vimeo.com/video/${parsed.videoId}?autoplay=0`}
          title={title ?? '動画'}
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  // Direct video URL (mp4, webm, etc.)
  if (error) {
    return <VideoErrorFallback url={url} title={title} onRetry={handleRetry} />
  }

  return (
    <div className="aspect-video w-full bg-slate-950">
      <video
        key={retryKey}
        src={parsed.url}
        title={title ?? '動画'}
        className="h-full w-full"
        controls
        playsInline
        preload="metadata"
        onError={() => setError(true)}
      />
    </div>
  )
}

export function VideoThumbnail({ url, title, className }: { url: string; title?: string; className?: string }) {
  const parsed = parseVideoUrl(url)

  if (parsed.type === 'youtube') {
    return (
      <div className={`relative overflow-hidden bg-slate-200 dark:bg-slate-800 ${className ?? ''}`}>
        <Image
          src={getYouTubeThumbnail(parsed.videoId)}
          alt={title ?? '動画サムネイル'}
          fill
          sizes="(max-width: 768px) 100vw, 320px"
          className="object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
            <Play className="h-3.5 w-3.5 text-slate-950" fill="currentColor" />
          </div>
        </div>
      </div>
    )
  }

  // Non-YouTube: show a generic video icon
  return (
    <div className={`flex items-center justify-center bg-slate-200 dark:bg-slate-800 ${className ?? ''}`}>
      <Play className="h-6 w-6 text-slate-500 dark:text-slate-400" />
    </div>
  )
}
