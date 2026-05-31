'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { mutateAtomVersionAction } from './actions'
import type { AdminAtomVersionStatus } from '../api'

const STATUS_RANK: Record<AdminAtomVersionStatus, number> = {
  archived: -1,
  draft: 0,
  reviewed: 1,
  experimental: 2,
  stable: 3,
}

function PromoteButton({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {label}
    </button>
  )
}

export function AtomVersionActions({
  versionId,
  currentStatus,
}: {
  versionId: string
  currentStatus: AdminAtomVersionStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isStableModalOpen, setIsStableModalOpen] = useState(false)
  const [stableChecked, setStableChecked] = useState(false)
  const [stableText, setStableText] = useState('')

  const runMutation = (payload: {
    action: 'promote' | 'rollback' | 'archive'
    target_status?: 'reviewed' | 'experimental' | 'stable'
  }) => {
    setError(null)

    startTransition(async () => {
      const result = await mutateAtomVersionAction(versionId, payload)

      if (!result.ok) {
        setError(result.error ?? 'Failed to update atom version.')
        return
      }

      setIsStableModalOpen(false)
      setStableChecked(false)
      setStableText('')
      router.refresh()
    })
  }

  const disableReviewed = STATUS_RANK.reviewed <= STATUS_RANK[currentStatus]
  const disableExperimental = STATUS_RANK.experimental <= STATUS_RANK[currentStatus]
  const disableStable = STATUS_RANK.stable <= STATUS_RANK[currentStatus]
  const canConfirmStable =
    stableChecked && stableText.trim().toLowerCase() === 'stable' && !isPending

  return (
    <div className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Actions
        </p>
        <h2 className="text-xl font-semibold text-slate-950">Owner-controlled promotion flow</h2>
        <p className="text-sm leading-6 text-slate-600">
          Stable must be promoted explicitly. No automatic stable promotion path exists in this UI.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <PromoteButton
          disabled={isPending || disableReviewed}
          label="Promote to reviewed"
          onClick={() => runMutation({ action: 'promote', target_status: 'reviewed' })}
        />
        <PromoteButton
          disabled={isPending || disableExperimental}
          label="Promote to experimental"
          onClick={() => runMutation({ action: 'promote', target_status: 'experimental' })}
        />
        <button
          type="button"
          disabled={isPending || disableStable}
          onClick={() => setIsStableModalOpen(true)}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Promote to stable
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => runMutation({ action: 'rollback' })}
          className="rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          Rollback
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => runMutation({ action: 'archive' })}
          className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          Archive
        </button>
      </div>

      {isStableModalOpen ? (
        <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-emerald-900">
              Stable promotion requires two explicit confirmations.
            </p>
            <p className="text-sm leading-6 text-emerald-800">
              Check the confirmation box, then type
              {' '}
              <code>stable</code>
              {' '}
              to unlock the action.
            </p>
          </div>

          <label className="mt-4 flex items-center gap-3 text-sm text-emerald-900">
            <input
              type="checkbox"
              checked={stableChecked}
              onChange={(event) => setStableChecked(event.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            I understand this is an owner-only stable promotion.
          </label>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-medium text-emerald-900">Type stable to confirm</span>
            <input
              type="text"
              value={stableText}
              onChange={(event) => setStableText(event.target.value)}
              className="w-full rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!canConfirmStable}
              onClick={() => runMutation({ action: 'promote', target_status: 'stable' })}
              className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Confirm stable promotion
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setIsStableModalOpen(false)
                setStableChecked(false)
                setStableText('')
              }}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
