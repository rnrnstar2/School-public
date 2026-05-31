'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
  Bell,
  Trophy,
  Flame,
  BookOpen,
  RefreshCw,
  CheckCircle,
  CheckCheck,
} from 'lucide-react'
import { useNotifications, type Notification } from '@/hooks/use-notifications'

const typeConfig: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  milestone_reached: { icon: Trophy, color: 'text-yellow-500', label: 'マイルストーン' },
  streak_update: { icon: Flame, color: 'text-orange-500', label: 'ストリーク' },
  lesson_recommendation: { icon: BookOpen, color: 'text-blue-500', label: 'レッスン推薦' },
  plan_revision: { icon: RefreshCw, color: 'text-purple-500', label: 'プラン改訂' },
  artifact_verified: { icon: CheckCircle, color: 'text-green-500', label: 'Artifact検証' },
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const diff = now - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}日前`
  return new Date(dateStr).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}

export default function NotificationCenter() {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markRead(notification.id)
    }
    if (notification.link) {
      router.push(notification.link)
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) setOpen(false)
        }}
        aria-label={`通知${unreadCount > 0 ? `（${unreadCount}件未読）` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative p-2 rounded-lg transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            role="region"
            aria-label="通知センター"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
            className="theme-popover absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-hidden rounded-xl z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">通知</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  すべて既読
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto max-h-[calc(70vh-52px)]">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  読み込み中...
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
                  <Bell className="w-8 h-8 mb-2 opacity-30" />
                  通知はありません
                </div>
              ) : (
                <ul role="list" className="divide-y divide-border/50">
                  {notifications.map((n) => {
                    const config = typeConfig[n.type] ?? {
                      icon: Bell,
                      color: 'text-gray-500',
                      label: n.type,
                    }
                    const Icon = config.icon
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-4 py-3 flex gap-3 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                            !n.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                          }`}
                        >
                          <div className={`mt-0.5 shrink-0 ${config.color}`}>
                            <Icon className="w-4.5 h-4.5" aria-hidden="true" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                                {n.title}
                              </p>
                              {!n.read && (
                                <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                              )}
                            </div>
                            {n.body && (
                              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                {n.body}
                              </p>
                            )}
                            <p className="mt-1 text-[11px] text-muted-foreground/70">
                              {formatRelativeTime(n.created_at)}
                            </p>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
