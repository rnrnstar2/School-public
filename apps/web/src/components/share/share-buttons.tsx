'use client'

import { useState, useCallback } from 'react'
import { ExternalLink, Loader2, Share2, Link2, Check } from 'lucide-react'
import { trackShareCardShared } from '@/lib/analytics/events'

/* ---------- icons ---------- */

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
    </svg>
  )
}

/* ---------- props ---------- */

export interface ShareButtonsProps {
  certificateId: string
  goalSummary: string
  trackName?: string | null
}

/* ---------- component ---------- */

export function ShareButtons({ certificateId, goalSummary, trackName }: ShareButtonsProps) {
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)
  const [copied, setCopied] = useState(false)

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = `${siteUrl}/share/${certificateId}`

  const twitterText = trackName
    ? `「${goalSummary}」— ${trackName} トラックを卒業しました！ #School #AI学習`
    : `「${goalSummary}」を達成しました！ #School #AI学習`

  /** Opt-in: mark certificate as shared, then open share target */
  const handleShare = useCallback(
    async (target: 'twitter' | 'discord' | 'copy') => {
      // Mark as shared (opt-in) if not already
      if (!shared) {
        setSharing(true)
        try {
          const res = await fetch('/api/certificate/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ certificate_id: certificateId }),
          })
          if (res.ok) {
            setShared(true)
          } else {
            setSharing(false)
            return
          }
        } catch {
          setSharing(false)
          return
        }
        setSharing(false)
      }

      trackShareCardShared(certificateId, target)

      if (target === 'twitter') {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(shareUrl)}`
        window.open(url, '_blank', 'noopener,noreferrer')
      } else if (target === 'discord') {
        // Copy the share link for Discord (no direct share API)
        await navigator.clipboard.writeText(`${twitterText}\n${shareUrl}`)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else if (target === 'copy') {
        await navigator.clipboard.writeText(shareUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    },
    [certificateId, shared, shareUrl, twitterText],
  )

  const btnBase =
    'inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <Share2 className="h-3.5 w-3.5" />
        共有
      </span>

      {/* Twitter/X */}
      <button
        type="button"
        onClick={() => handleShare('twitter')}
        disabled={sharing}
        className={`${btnBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}
      >
        {sharing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <TwitterIcon className="h-4 w-4" />
        )}
        Twitter / X
      </button>

      {/* Discord */}
      <button
        type="button"
        onClick={() => handleShare('discord')}
        disabled={sharing}
        className={`${btnBase} border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20`}
      >
        {sharing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <DiscordIcon className="h-4 w-4" />
        )}
        {copied ? 'コピーしました！' : 'Discord'}
      </button>

      {/* Copy Link */}
      <button
        type="button"
        onClick={() => handleShare('copy')}
        disabled={sharing}
        className={`${btnBase} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800`}
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {copied ? 'コピー済み' : 'リンクをコピー'}
      </button>
    </div>
  )
}
