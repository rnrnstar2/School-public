'use client'

import { MotionConfig } from 'framer-motion'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  applyMotionPreference,
  getSystemMotionPreference,
  resolveMotionPreference,
  STORAGE_MOTION_KEY,
  type MotionPreference,
} from './theme-motion'

type ThemePreferencesContextValue = {
  mounted: boolean
  motionPreference: MotionPreference
  setMotionPreference: (preference: MotionPreference) => void
  toggleMotionPreference: () => void
}

const ThemePreferencesContext = createContext<ThemePreferencesContextValue | null>(null)
const emptySubscribe = () => () => {}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [motionPreference, setMotionPreferenceState] = useState<MotionPreference>(resolveMotionPreference)

  useEffect(() => {
    applyMotionPreference(motionPreference)
  }, [motionPreference])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleMotionChange = () => {
      if (window.localStorage.getItem(STORAGE_MOTION_KEY)) {
        return
      }

      setMotionPreferenceState(getSystemMotionPreference())
    }

    mediaQuery.addEventListener('change', handleMotionChange)

    return () => {
      mediaQuery.removeEventListener('change', handleMotionChange)
    }
  }, [])

  const setMotionPreference = useCallback((preference: MotionPreference) => {
    setMotionPreferenceState(preference)
    applyMotionPreference(preference)
    window.localStorage.setItem(STORAGE_MOTION_KEY, preference)
  }, [])

  const toggleMotionPreference = useCallback(() => {
    setMotionPreference(motionPreference === 'full' ? 'reduced' : 'full')
  }, [motionPreference, setMotionPreference])

  const value = useMemo<ThemePreferencesContextValue>(
    () => ({
      mounted,
      motionPreference,
      setMotionPreference,
      toggleMotionPreference,
    }),
    [mounted, motionPreference, setMotionPreference, toggleMotionPreference]
  )

  return (
    <ThemePreferencesContext.Provider value={value}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
        enableSystem={false}
        storageKey="school-theme"
      >
        <MotionConfig reducedMotion={motionPreference === 'reduced' ? 'always' : 'never'}>
          {children}
        </MotionConfig>
      </NextThemesProvider>
    </ThemePreferencesContext.Provider>
  )
}

export function useThemePreferences() {
  const context = useContext(ThemePreferencesContext)

  if (!context) {
    throw new Error('useThemePreferences must be used within ThemeProvider')
  }

  return context
}
