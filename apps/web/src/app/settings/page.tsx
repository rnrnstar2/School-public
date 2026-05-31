'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import {
  User,
  Download,
  Trash2,
  KeyRound,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Bell,
  Mail,
  Navigation,
} from 'lucide-react'
import { resetTourCompleted } from '@/components/onboarding/onboarding-tour'
import { useReminderNotification } from '@/hooks/use-reminder-notification'
import { useEmailPreferences, type EmailPreferences } from '@/hooks/use-email-preferences'
import { useNotificationPreferences } from '@/hooks/use-notifications'
import Link from 'next/link'

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function SettingsPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [originalDisplayName, setOriginalDisplayName] = useState('')

  // Status states
  const [profileStatus, setProfileStatus] = useState<Status>('idle')
  const [passwordStatus, setPasswordStatus] = useState<Status>('idle')
  const [exportStatus, setExportStatus] = useState<Status>('idle')
  const [deleteStatus, setDeleteStatus] = useState<Status>('idle')
  const [statusMessage, setStatusMessage] = useState('')

  // Password fields
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Delete confirmation
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setEmail(user.email ?? null)

      // Load display name from learner_profile
      const { data: profile } = await supabase
        .from('learner_profile')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()

      if (profile?.display_name) {
        setDisplayName(profile.display_name)
        setOriginalDisplayName(profile.display_name)
      }
    }
    loadUser()
  }, [router])

  const handleUpdateProfile = async () => {
    setProfileStatus('loading')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('learner_profile')
      .upsert({ user_id: user.id, display_name: displayName.trim() }, { onConflict: 'user_id' })

    if (error) {
      setProfileStatus('error')
      setStatusMessage('プロフィールの更新に失敗しました。')
    } else {
      setOriginalDisplayName(displayName.trim())
      setProfileStatus('success')
      setStatusMessage('プロフィールを更新しました。')
    }
    setTimeout(() => setProfileStatus('idle'), 3000)
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordStatus('error')
      setStatusMessage('パスワードは6文字以上で入力してください。')
      setTimeout(() => setPasswordStatus('idle'), 3000)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus('error')
      setStatusMessage('パスワードが一致しません。')
      setTimeout(() => setPasswordStatus('idle'), 3000)
      return
    }

    setPasswordStatus('loading')
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordStatus('error')
      setStatusMessage('パスワードの変更に失敗しました。')
    } else {
      setNewPassword('')
      setConfirmPassword('')
      setPasswordStatus('success')
      setStatusMessage('パスワードを変更しました。')
    }
    setTimeout(() => setPasswordStatus('idle'), 3000)
  }

  const handleExportData = async () => {
    setExportStatus('loading')
    try {
      const res = await fetch('/api/user/export')
      if (!res.ok) throw new Error('export failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `school-data-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExportStatus('success')
      setStatusMessage('データをダウンロードしました。')
    } catch {
      setExportStatus('error')
      setStatusMessage('データのエクスポートに失敗しました。')
    }
    setTimeout(() => setExportStatus('idle'), 3000)
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'アカウントを削除') return

    setDeleteStatus('loading')
    try {
      const res = await fetch('/api/user/delete', { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')

      await supabase.auth.signOut()
      router.push('/login')
    } catch {
      setDeleteStatus('error')
      setStatusMessage('アカウントの削除に失敗しました。')
      setTimeout(() => setDeleteStatus('idle'), 3000)
    }
  }

  const reminder = useReminderNotification()
  const emailPrefs = useEmailPreferences()
  const inAppPrefs = useNotificationPreferences()

  const profileChanged = displayName.trim() !== originalDisplayName

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/plan"
            className="p-2 rounded-lg hover:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="戻る"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">アカウント設定</h1>
        </div>

        {/* Profile Section */}
        <Section title="プロフィール" icon={User}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-muted-foreground mb-1">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email ?? ''}
                disabled
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
              />
            </div>
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-muted-foreground mb-1">
                表示名
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="表示名を入力"
                maxLength={100}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <ActionButton
              onClick={handleUpdateProfile}
              status={profileStatus}
              disabled={!profileChanged}
              label="プロフィールを更新"
              statusMessage={statusMessage}
            />
          </div>
        </Section>

        {/* Password Section */}
        <Section title="パスワード変更" icon={KeyRound}>
          <div className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-muted-foreground mb-1">
                新しいパスワード
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6文字以上"
                minLength={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-muted-foreground mb-1">
                パスワード確認
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="もう一度入力"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
              />
            </div>
            <ActionButton
              onClick={handleChangePassword}
              status={passwordStatus}
              disabled={!newPassword || !confirmPassword}
              label="パスワードを変更"
              statusMessage={statusMessage}
            />
          </div>
        </Section>

        {/* Notification / Reminder Section */}
        <Section title="学習リマインダー" icon={Bell}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              毎日の学習リマインダー通知を設定して、ストリークを維持しましょう。
            </p>

            {reminder.settings.permission === 'unsupported' ? (
              <p className="text-sm text-muted-foreground">
                お使いのブラウザは通知に対応していません。
              </p>
            ) : reminder.settings.permission === 'denied' ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                通知がブラウザ設定でブロックされています。ブラウザの設定から通知を許可してください。
              </p>
            ) : reminder.settings.permission !== 'granted' ? (
              <button
                onClick={reminder.requestPermission}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                通知を許可する
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <label htmlFor="reminderEnabled" className="text-sm font-medium text-foreground">
                    リマインダー通知
                  </label>
                  <button
                    id="reminderEnabled"
                    type="button"
                    role="switch"
                    aria-checked={reminder.settings.enabled}
                    onClick={() => reminder.toggleEnabled(!reminder.settings.enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      reminder.settings.enabled
                        ? 'bg-blue-600'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        reminder.settings.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {reminder.settings.enabled && (
                  <div>
                    <label htmlFor="reminderTime" className="block text-sm font-medium text-muted-foreground mb-1">
                      リマインダー時刻
                    </label>
                    <input
                      id="reminderTime"
                      type="time"
                      value={reminder.settings.time}
                      onChange={(e) => reminder.setTime(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none sm:w-40"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      ブラウザが開いている場合に通知が送信されます。
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </Section>

        {/* In-App Notification Preferences Section */}
        <Section title="インアプリ通知" icon={Bell}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ヘッダーのベルアイコンに表示されるインアプリ通知の種類を選択できます。
            </p>

            {inAppPrefs.loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                読み込み中...
              </div>
            ) : (
              <>
                <ToggleRow
                  id="inAppMilestone"
                  label="マイルストーン到達通知"
                  checked={inAppPrefs.preferences.in_app_milestone}
                  onChange={(v) => inAppPrefs.update({ in_app_milestone: v })}
                />
                <ToggleRow
                  id="inAppStreak"
                  label="ストリーク更新通知"
                  checked={inAppPrefs.preferences.in_app_streak}
                  onChange={(v) => inAppPrefs.update({ in_app_streak: v })}
                />
                <ToggleRow
                  id="inAppLessonRecommendation"
                  label="レッスン推薦通知"
                  checked={inAppPrefs.preferences.in_app_lesson_recommendation}
                  onChange={(v) => inAppPrefs.update({ in_app_lesson_recommendation: v })}
                />
                <ToggleRow
                  id="inAppPlanRevision"
                  label="プラン改訂提案通知"
                  checked={inAppPrefs.preferences.in_app_plan_revision}
                  onChange={(v) => inAppPrefs.update({ in_app_plan_revision: v })}
                />
                <ToggleRow
                  id="inAppArtifactVerified"
                  label="Artifact検証結果通知"
                  checked={inAppPrefs.preferences.in_app_artifact_verified}
                  onChange={(v) => inAppPrefs.update({ in_app_artifact_verified: v })}
                />

                {inAppPrefs.saveStatus === 'success' && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    設定を保存しました。
                  </motion.p>
                )}
                {inAppPrefs.saveStatus === 'error' && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-red-600 dark:text-red-400"
                  >
                    設定の保存に失敗しました。
                  </motion.p>
                )}
              </>
            )}
          </div>
        </Section>

        {/* Email Notification Section */}
        <Section title="メール通知" icon={Mail}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ストリーク途切れリスク時のリマインダーや、マイルストーン達成・卒業時の祝福メールを受け取れます。
            </p>

            {emailPrefs.loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                読み込み中...
              </div>
            ) : (
              <>
                {/* Email opt-in toggle */}
                <ToggleRow
                  id="emailEnabled"
                  label="メール通知を有効にする"
                  checked={emailPrefs.preferences.email_enabled}
                  onChange={(v) => emailPrefs.update({ email_enabled: v })}
                />

                {emailPrefs.preferences.email_enabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 pl-1"
                  >
                    {/* Frequency */}
                    <div>
                      <label htmlFor="emailFrequency" className="block text-sm font-medium text-muted-foreground mb-1">
                        リマインダー頻度
                      </label>
                      <select
                        id="emailFrequency"
                        value={emailPrefs.preferences.frequency}
                        onChange={(e) =>
                          emailPrefs.update({ frequency: e.target.value as EmailPreferences['frequency'] })
                        }
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-ring focus:outline-none sm:w-48"
                      >
                        <option value="daily">毎日（最大1通/日）</option>
                        <option value="weekly">週1回</option>
                        <option value="never">リマインダーなし</option>
                      </select>
                    </div>

                    {/* Milestone emails */}
                    <ToggleRow
                      id="milestoneEmails"
                      label="マイルストーン達成メール"
                      checked={emailPrefs.preferences.milestone_emails}
                      onChange={(v) => emailPrefs.update({ milestone_emails: v })}
                    />

                    {/* Graduation emails */}
                    <ToggleRow
                      id="graduationEmails"
                      label="卒業祝福メール"
                      checked={emailPrefs.preferences.graduation_emails}
                      onChange={(v) => emailPrefs.update({ graduation_emails: v })}
                    />
                  </motion.div>
                )}

                {emailPrefs.saveStatus === 'success' && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    設定を保存しました。
                  </motion.p>
                )}
                {emailPrefs.saveStatus === 'error' && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-red-600 dark:text-red-400"
                  >
                    設定の保存に失敗しました。
                  </motion.p>
                )}
              </>
            )}
          </div>
        </Section>

        {/* Onboarding Tour Replay Section */}
        <Section title="オンボーディングツアー" icon={Navigation}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              メンターワークスペースの使い方をステップバイステップで確認できます。
            </p>
            <button
              onClick={() => {
                resetTourCompleted()
                router.push('/plan')
              }}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              ツアーを再表示する
            </button>
          </div>
        </Section>

        {/* Data Export Section */}
        <Section title="データエクスポート" icon={Download}>
          <p className="text-sm text-muted-foreground mb-4">
            学習データ（プロフィール、学習状態、メンターメモリ、ゴール履歴、タスク進捗、チャット履歴）をJSON形式でダウンロードします。
          </p>
          <ActionButton
            onClick={handleExportData}
            status={exportStatus}
            label="データをダウンロード"
            statusMessage={statusMessage}
          />
        </Section>

        {/* Account Deletion Section */}
        <Section title="アカウント削除" icon={Trash2} danger>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              アカウントを削除すると、すべての学習データが完全に削除され、復元できません。
            </p>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                アカウントを削除する
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10 p-4"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    確認のため「アカウントを削除」と入力してください。
                  </p>
                </div>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="アカウントを削除"
                  className="w-full rounded-lg border border-red-300 dark:border-red-800 bg-background px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteConfirmText('')
                    }}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'アカウントを削除' || deleteStatus === 'loading'}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {deleteStatus === 'loading' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      '完全に削除する'
                    )}
                  </button>
                </div>
                {deleteStatus === 'error' && (
                  <p className="text-sm text-red-600">{statusMessage}</p>
                )}
              </motion.div>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  danger,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-6 ${
        danger
          ? 'border-red-200 dark:border-red-900/50'
          : 'border-border'
      } bg-card`}
    >
      <h2 className={`flex items-center gap-2 text-lg font-semibold mb-4 ${
        danger ? 'text-red-600 dark:text-red-400' : 'text-foreground'
      }`}>
        <Icon className="w-5 h-5" />
        {title}
      </h2>
      {children}
    </motion.section>
  )
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
          checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function ActionButton({
  onClick,
  status,
  disabled,
  label,
  statusMessage,
}: {
  onClick: () => void
  status: Status
  disabled?: boolean
  label: string
  statusMessage: string
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={disabled || status === 'loading'}
        className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {status === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          label
        )}
      </button>
      {status === 'success' && (
        <motion.span
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"
        >
          <CheckCircle2 className="w-4 h-4" />
          {statusMessage}
        </motion.span>
      )}
      {status === 'error' && (
        <motion.span
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-sm text-red-600 dark:text-red-400"
        >
          {statusMessage}
        </motion.span>
      )}
    </div>
  )
}
