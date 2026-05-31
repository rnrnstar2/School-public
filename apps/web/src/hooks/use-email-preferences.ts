'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface EmailPreferences {
  email_enabled: boolean
  frequency: 'daily' | 'weekly' | 'never'
  milestone_emails: boolean
  graduation_emails: boolean
}

const DEFAULT_PREFS: EmailPreferences = {
  email_enabled: false,
  frequency: 'daily',
  milestone_emails: true,
  graduation_emails: true,
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

export function useEmailPreferences() {
  const [preferences, setPreferences] = useState<EmailPreferences>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/notifications/email-preferences')
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json()
      })
      .then((data: { preferences: EmailPreferences }) => {
        setPreferences(data.preferences)
      })
      .catch(() => {
        // Use defaults on error
      })
      .finally(() => setLoading(false))
  }, [])

  const save = useCallback((updated: EmailPreferences) => {
    // Debounce saves to avoid rapid fire
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        const res = await fetch('/api/notifications/email-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
        if (!res.ok) throw new Error('save failed')
        setSaveStatus('success')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } catch {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    }, 500)
  }, [])

  const update = useCallback(
    (partial: Partial<EmailPreferences>) => {
      setPreferences((prev) => {
        const next = { ...prev, ...partial }
        save(next)
        return next
      })
    },
    [save],
  )

  return { preferences, loading, saveStatus, update }
}
