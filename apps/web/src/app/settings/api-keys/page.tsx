'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Info,
  Trash2,
} from 'lucide-react'

const PROVIDER_META = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    hint: 'コード生成・推論・拡張思考が得意',
  },
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    placeholder: 'sk-...',
    helpUrl: 'https://platform.openai.com/api-keys',
    hint: '汎用・tool-use・大規模コスパが得意',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    placeholder: 'AIza...',
    helpUrl: 'https://aistudio.google.com/app/apikey',
    hint: 'Web 検索・最新情報・大規模文脈が得意',
  },
  {
    id: 'zai',
    label: 'Z.AI (GLM-5)',
    placeholder: 'zai-...',
    helpUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    hint: '日本語会話・コスト効率が得意',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    placeholder: 'xai-...',
    helpUrl: 'https://console.x.ai',
    hint: '最新トレンド・X (Twitter) 連携が得意',
  },
] as const

type ProviderId = (typeof PROVIDER_META)[number]['id']

type ProviderStatus = {
  provider: ProviderId
  configured: boolean
  keyHint: string | null
  updatedAt: string | null
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function ApiKeysPage() {
  const router = useRouter()
  const [statuses, setStatuses] = useState<Record<ProviderId, ProviderStatus>>(() =>
    Object.fromEntries(
      PROVIDER_META.map((p) => [
        p.id,
        { provider: p.id, configured: false, keyHint: null, updatedAt: null },
      ]),
    ) as Record<ProviderId, ProviderStatus>,
  )
  const [drafts, setDrafts] = useState<Record<ProviderId, string>>(() =>
    Object.fromEntries(PROVIDER_META.map((p) => [p.id, ''])) as Record<ProviderId, string>,
  )
  const [rowStatus, setRowStatus] = useState<Record<ProviderId, Status>>(() =>
    Object.fromEntries(PROVIDER_META.map((p) => [p.id, 'idle'])) as Record<ProviderId, Status>,
  )
  const [rowMessage, setRowMessage] = useState<Record<ProviderId, string>>(() =>
    Object.fromEntries(PROVIDER_META.map((p) => [p.id, ''])) as Record<ProviderId, string>,
  )
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/api-keys', { cache: 'no-store' })
      if (res.status === 401) {
        setUnauthorized(true)
        return
      }
      if (!res.ok) throw new Error('failed to fetch api keys')
      const data = (await res.json()) as { providers: ProviderStatus[] }
      const next = Object.fromEntries(
        PROVIDER_META.map((p) => [
          p.id,
          data.providers.find((row) => row.provider === p.id) ?? {
            provider: p.id,
            configured: false,
            keyHint: null,
            updatedAt: null,
          },
        ]),
      ) as Record<ProviderId, ProviderStatus>
      setStatuses(next)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (unauthorized) router.push('/login')
  }, [unauthorized, router])

  const setStatus = (provider: ProviderId, status: Status, message: string) => {
    setRowStatus((prev) => ({ ...prev, [provider]: status }))
    setRowMessage((prev) => ({ ...prev, [provider]: message }))
    if (status === 'success' || status === 'error') {
      setTimeout(() => {
        setRowStatus((prev) => ({ ...prev, [provider]: 'idle' }))
      }, 3000)
    }
  }

  const handleSave = async (provider: ProviderId) => {
    const key = drafts[provider].trim()
    if (key.length < 8) {
      setStatus(provider, 'error', 'API キーは 8 文字以上で入力してください。')
      return
    }
    setStatus(provider, 'loading', '')
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? '保存に失敗しました。')
      }
      setDrafts((prev) => ({ ...prev, [provider]: '' }))
      setStatus(provider, 'success', 'API キーを保存しました（Phase 3 で有効化されます）。')
      void refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存に失敗しました。'
      setStatus(provider, 'error', message)
    }
  }

  const handleDelete = async (provider: ProviderId) => {
    setStatus(provider, 'loading', '')
    try {
      const res = await fetch(`/api/settings/api-keys?provider=${provider}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('削除に失敗しました。')
      setStatus(provider, 'success', 'API キーを削除しました。')
      void refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : '削除に失敗しました。'
      setStatus(provider, 'error', message)
    }
  }

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/settings"
            className="p-2 rounded-lg hover:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">API キー（BYOK）</h1>
        </div>

        {/* Phase 1 status banner — 嘘 UI 止血 (TQ-247) */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          aria-live="polite"
          className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-6"
        >
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-900 dark:text-amber-100 space-y-2">
              <p className="font-semibold text-base">
                Phase 1 — GLM-5 経由で稼働中
              </p>
              <p>
                <strong>現時点では、入力した API キーは各社の AI には直接接続されません。</strong>
                学習者向けの AI メンターは Phase 1 として
                <span className="font-mono">GLM-5</span>
                単一プロバイダで稼働中です。ここで保存したキーは Phase 3 切替後に有効化されます。
              </p>
            </div>
          </div>
        </motion.section>

        {/* Phase ロードマップ */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-6"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-3">
              <div>
                <p className="font-semibold text-foreground mb-1">
                  Phase 1（現在）
                </p>
                <p>
                  学習者向けの AI メンターは
                  <span className="font-mono">GLM-5</span>
                  単一プロバイダで稼働中です。各社（Anthropic / OpenAI / Gemini）への直接接続は
                  <strong className="text-foreground">行われません</strong>。
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">
                  Phase 3（順次展開）
                </p>
                <p>
                  各社（Anthropic / OpenAI / Gemini）への直接接続を準備中です。今入力した API
                  キーは Phase 3 切替後に有効化されます。Phase 3 を opt-in する環境変数
                  <span className="font-mono">{' MENTOR_PROVIDER_PHASE3=1 '}</span>
                  は管理者向けで、学習者は Phase 1 で運用されます。
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground mb-1">
                  キーの保管について
                </p>
                <p>
                  入力されたキーは AES-256-GCM
                  で暗号化して保存され、画面には先頭/末尾のみ表示されます。Phase 3 で有効化されるまで、各社 API
                  への送信には使用されません。
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            読み込み中...
          </div>
        ) : (
          PROVIDER_META.map((meta) => {
            const status = statuses[meta.id]
            const draft = drafts[meta.id]
            const localStatus = rowStatus[meta.id]
            const localMessage = rowMessage[meta.id]
            const isBusy = localStatus === 'loading'

            return (
              <motion.section
                key={meta.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <KeyRound className="w-5 h-5" />
                    {meta.label}
                  </h2>
                  <a
                    href={meta.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400 shrink-0 mt-1"
                  >
                    キー発行ページ
                  </a>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">{meta.hint}</p>

                <div className="space-y-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">状態: </span>
                    {status.configured ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        保存済み（Phase 3 で有効化予定）
                        {status.keyHint && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {status.keyHint}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">未設定</span>
                    )}
                  </div>

                  <label
                    htmlFor={`apikey-${meta.id}`}
                    className="block text-sm font-medium text-muted-foreground"
                  >
                    新しい API キーを入力
                  </label>
                  <input
                    id={`apikey-${meta.id}`}
                    type="password"
                    autoComplete="off"
                    value={draft}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [meta.id]: e.target.value }))
                    }
                    placeholder={meta.placeholder}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                  />

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={() => handleSave(meta.id)}
                      disabled={isBusy || draft.trim().length < 8}
                      className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : status.configured ? (
                        '更新する'
                      ) : (
                        '保存する'
                      )}
                    </button>

                    {status.configured && (
                      <button
                        onClick={() => handleDelete(meta.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1 rounded-lg border border-red-300 dark:border-red-800 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Trash2 className="w-4 h-4" />
                        削除
                      </button>
                    )}

                    {localStatus === 'success' && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {localMessage}
                      </motion.span>
                    )}
                    {localStatus === 'error' && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-sm text-red-600 dark:text-red-400"
                      >
                        {localMessage}
                      </motion.span>
                    )}
                  </div>
                </div>
              </motion.section>
            )
          })
        )}
      </div>
    </div>
  )
}
