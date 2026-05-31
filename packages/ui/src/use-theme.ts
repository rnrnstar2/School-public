'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useTheme as useNextTheme } from 'next-themes'

type Theme = 'light' | 'dark'
const emptySubscribe = () => () => {}

export function useTheme() {
  const { resolvedTheme, setTheme } = useNextTheme()
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  const theme: Theme = resolvedTheme === 'dark' ? 'dark' : 'light'

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }, [setTheme, theme])

  return { theme, toggleTheme, mounted }
}
