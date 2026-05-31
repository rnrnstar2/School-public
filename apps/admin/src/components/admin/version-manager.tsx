'use client'

import { useState } from 'react'

// ── Types ──

interface LessonVersionSummary {
  id: string
  version: number
  status: 'draft' | 'review' | 'published' | 'archived'
  changelog?: string | null
  published_at?: string | null
  archived_at?: string | null
  created_at: string
}

interface VersionManagerProps {
  lessonId: string
  versions: LessonVersionSummary[]
  currentVersionId: string
  onCreateVersion: () => void
  onSwitchVersion: (versionId: string) => void
  onPublish: (versionId: string) => void
  onArchive: (versionId: string) => void
}

// ── Constants ──

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; label: string; dot: string }
> = {
  draft: {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    label: '下書き',
    dot: 'bg-slate-400',
  },
  review: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    label: 'レビュー中',
    dot: 'bg-amber-400',
  },
  published: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: '公開中',
    dot: 'bg-emerald-400',
  },
  archived: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    label: 'アーカイブ',
    dot: 'bg-red-400',
  },
}

// ── Component ──

export function VersionManager({
  versions,
  currentVersionId,
  onCreateVersion,
  onSwitchVersion,
  onPublish,
  onArchive,
}: VersionManagerProps) {
  const [confirmAction, setConfirmAction] = useState<{
    type: 'publish' | 'archive'
    versionId: string
    version: number
  } | null>(null)

  const sortedVersions = [...versions].sort((a, b) => b.version - a.version)

  const handleConfirm = () => {
    if (!confirmAction) return
    if (confirmAction.type === 'publish') {
      onPublish(confirmAction.versionId)
    } else {
      onArchive(confirmAction.versionId)
    }
    setConfirmAction(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          バージョン管理
        </h3>
        <button
          type="button"
          onClick={onCreateVersion}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          + 新しいバージョン作成
        </button>
      </div>

      {/* ── Confirmation Dialog ── */}
      {confirmAction && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            {confirmAction.type === 'publish'
              ? `v${confirmAction.version} を公開しますか？`
              : `v${confirmAction.version} をアーカイブしますか？`}
          </p>
          <p className="mt-1 text-xs text-amber-600">
            {confirmAction.type === 'publish'
              ? '公開すると学習者がこのバージョンを閲覧できるようになります。'
              : 'アーカイブすると学習者にはこのバージョンが表示されなくなります。'}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold text-white transition ${
                confirmAction.type === 'publish'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {confirmAction.type === 'publish' ? '公開する' : 'アーカイブする'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-950"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ── Version Timeline ── */}
      <div className="space-y-0">
        {sortedVersions.map((ver, idx) => {
          const config = STATUS_CONFIG[ver.status] ?? STATUS_CONFIG.draft
          const isCurrent = ver.id === currentVersionId
          const isLast = idx === sortedVersions.length - 1

          return (
            <div key={ver.id} className="relative flex gap-4">
              {/* Timeline connector */}
              <div className="flex flex-col items-center">
                <div
                  className={`z-10 h-4 w-4 rounded-full border-2 ${
                    isCurrent
                      ? 'border-emerald-600 bg-emerald-600'
                      : `border-slate-300 ${config.dot}`
                  }`}
                />
                {!isLast && <div className="h-full w-0.5 bg-slate-200" />}
              </div>

              {/* Version Card */}
              <div
                className={`mb-3 flex-1 rounded-2xl border p-4 transition ${
                  isCurrent
                    ? 'border-emerald-300 bg-emerald-50/50 shadow-sm'
                    : `${config.border} bg-white hover:shadow-sm`
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">v{ver.version}</span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
                      >
                        {config.label}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          編集中
                        </span>
                      )}
                    </div>
                    {ver.changelog && (
                      <p className="text-xs text-slate-500">{ver.changelog}</p>
                    )}
                    <p className="text-xs text-slate-400">
                      作成: {new Date(ver.created_at).toLocaleDateString('ja-JP')}
                      {ver.published_at && (
                        <>
                          {' '}
                          / 公開: {new Date(ver.published_at).toLocaleDateString('ja-JP')}
                        </>
                      )}
                      {ver.archived_at && (
                        <>
                          {' '}
                          / アーカイブ: {new Date(ver.archived_at).toLocaleDateString('ja-JP')}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => onSwitchVersion(ver.id)}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                      >
                        切替
                      </button>
                    )}

                    {/* Status transitions */}
                    {ver.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({ type: 'publish', versionId: ver.id, version: ver.version })
                        }
                        className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-200"
                      >
                        レビューへ
                      </button>
                    )}
                    {ver.status === 'review' && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({ type: 'publish', versionId: ver.id, version: ver.version })
                        }
                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        公開
                      </button>
                    )}
                    {ver.status === 'published' && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({ type: 'archive', versionId: ver.id, version: ver.version })
                        }
                        className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-200"
                      >
                        アーカイブ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {versions.length === 0 && (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">バージョンがありません</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            「新しいバージョン作成」ボタンで最初のバージョンを作成してください。
          </p>
        </div>
      )}
    </div>
  )
}
