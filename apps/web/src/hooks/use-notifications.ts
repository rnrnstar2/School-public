'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  link: string | null
  created_at: string
}

export interface NotificationPreferences {
  in_app_milestone: boolean
  in_app_streak: boolean
  in_app_lesson_recommendation: boolean
  in_app_plan_revision: boolean
  in_app_artifact_verified: boolean
}

const DEFAULT_PREFS: NotificationPreferences = {
  in_app_milestone: true,
  in_app_streak: true,
  in_app_lesson_recommendation: true,
  in_app_plan_revision: true,
  in_app_artifact_verified: true,
}

/** Polling interval: 60 seconds */
const POLL_INTERVAL = 60_000

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/in-app')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    timerRef.current = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [fetchNotifications])

  const markRead = useCallback(async (notificationId: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))

    try {
      await fetch('/api/notifications/in-app', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', notificationId }),
      })
    } catch {
      // Revert on failure
      fetchNotifications()
    }
  }, [fetchNotifications])

  const markAllRead = useCallback(async () => {
    const prevNotifications = notifications
    const prevCount = unreadCount

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)

    try {
      const res = await fetch('/api/notifications/in-app', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setNotifications(prevNotifications)
      setUnreadCount(prevCount)
    }
  }, [notifications, unreadCount, fetchNotifications])

  return { notifications, unreadCount, loading, markRead, markAllRead, refresh: fetchNotifications }
}

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/notifications/in-app/preferences')
        if (!res.ok) return
        const data = await res.json()
        setPreferences(data.preferences)
      } catch {
        // use defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const update = useCallback(async (partial: Partial<NotificationPreferences>) => {
    const updated = { ...preferences, ...partial }
    setPreferences(updated)
    setSaveStatus('idle')

    try {
      const res = await fetch('/api/notifications/in-app/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      if (!res.ok) throw new Error()
      setSaveStatus('success')
    } catch {
      setSaveStatus('error')
    }
    setTimeout(() => setSaveStatus('idle'), 3000)
  }, [preferences])

  return { preferences, loading, saveStatus, update }
}
