'use client'

import { useCallback, useEffect, useState } from 'react'

const REMINDER_ENABLED_KEY = 'school:reminder-enabled'
const REMINDER_TIME_KEY = 'school:reminder-time'
const DEFAULT_REMINDER_TIME = '19:00'

export interface ReminderSettings {
  enabled: boolean
  time: string // HH:mm format
  permission: NotificationPermission | 'unsupported'
}

export function useReminderNotification() {
  const [settings, setSettings] = useState<ReminderSettings>(() => {
    if (typeof window === 'undefined') {
      return {
        enabled: false,
        time: DEFAULT_REMINDER_TIME,
        permission: 'unsupported',
      }
    }

    const supported = 'Notification' in window
    const enabled = localStorage.getItem(REMINDER_ENABLED_KEY) === '1'
    const time = localStorage.getItem(REMINDER_TIME_KEY) ?? DEFAULT_REMINDER_TIME
    const permission: NotificationPermission | 'unsupported' = supported
      ? Notification.permission
      : 'unsupported'

    return { enabled: enabled && permission === 'granted', time, permission }
  })

  // Schedule daily reminder using setTimeout (recalculated on each visit)
  useEffect(() => {
    if (!settings.enabled || settings.permission !== 'granted') return

    const [hours, minutes] = settings.time.split(':').map(Number)
    const now = new Date()
    const target = new Date()
    target.setHours(hours, minutes, 0, 0)

    // If target time already passed today, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }

    const delay = target.getTime() - now.getTime()
    const timer = setTimeout(() => {
      new Notification('School - 学習リマインダー', {
        body: 'ストリークを維持しましょう！今日の学習を始めませんか？',
        icon: '/icon-192.png',
        tag: 'school-reminder',
      })
    }, delay)

    return () => clearTimeout(timer)
  }, [settings.enabled, settings.permission, settings.time])

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return

    const result = await Notification.requestPermission()
    if (result === 'granted') {
      localStorage.setItem(REMINDER_ENABLED_KEY, '1')
      setSettings((prev) => ({ ...prev, enabled: true, permission: 'granted' }))
    } else {
      setSettings((prev) => ({ ...prev, permission: result }))
    }
  }, [])

  const toggleEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem(REMINDER_ENABLED_KEY, enabled ? '1' : '0')
    setSettings((prev) => ({ ...prev, enabled }))
  }, [])

  const setTime = useCallback((time: string) => {
    localStorage.setItem(REMINDER_TIME_KEY, time)
    setSettings((prev) => ({ ...prev, time }))
  }, [])

  return { settings, requestPermission, toggleEnabled, setTime }
}
