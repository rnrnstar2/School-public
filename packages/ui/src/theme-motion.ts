export type MotionPreference = 'full' | 'reduced'

export const STORAGE_MOTION_KEY = 'school-motion'

export const themeMotion = {
  spring: {
    type: 'spring' as const,
    stiffness: 280,
    damping: 26,
  },
  springSnappy: {
    type: 'spring' as const,
    stiffness: 360,
    damping: 30,
  },
  fade: {
    duration: 0.2,
  },
  drawer: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
  },
}

export function getSystemMotionPreference(): MotionPreference {
  if (typeof window === 'undefined') {
    return 'full'
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'
}

export function readStoredMotionPreference(): MotionPreference | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedPreference = window.localStorage.getItem(STORAGE_MOTION_KEY)
  return storedPreference === 'full' || storedPreference === 'reduced' ? storedPreference : null
}

export function resolveMotionPreference(): MotionPreference {
  return readStoredMotionPreference() ?? getSystemMotionPreference()
}

export function applyMotionPreference(preference: MotionPreference) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.motion = preference
}
