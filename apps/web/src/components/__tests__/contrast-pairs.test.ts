import { describe, expect, it } from 'vitest'
import colors from 'tailwindcss/colors'

type PairAudit = {
  label: string
  backgrounds: {
    light: string
    dark: string
  }
  before: {
    light: string
    dark: string
  }
  after: {
    light: string
    dark: string
  }
  expectedBeforeFailures: Array<'light' | 'dark'>
}

const WCAG_AA_MIN = 4.5

const auditedPairs: PairAudit[] = [
  {
    label: 'default secondary text on subtle panel',
    backgrounds: {
      light: 'bg-slate-50',
      dark: 'dark:bg-slate-900',
    },
    before: {
      light: 'text-slate-500',
      dark: 'dark:text-slate-400',
    },
    after: {
      light: 'text-slate-600',
      dark: 'dark:text-slate-300',
    },
    expectedBeforeFailures: [],
  },
  {
    label: 'default secondary text on strong surface',
    backgrounds: {
      light: 'bg-white',
      dark: 'dark:bg-slate-950',
    },
    before: {
      light: 'text-slate-500',
      dark: 'dark:text-slate-400',
    },
    after: {
      light: 'text-slate-500',
      dark: 'dark:text-slate-300',
    },
    expectedBeforeFailures: [],
  },
  {
    label: 'strong secondary text on subtle panel',
    backgrounds: {
      light: 'bg-slate-50',
      dark: 'dark:bg-slate-900',
    },
    before: {
      light: 'text-slate-600',
      dark: 'dark:text-slate-300',
    },
    after: {
      light: 'text-slate-600',
      dark: 'dark:text-slate-300',
    },
    expectedBeforeFailures: [],
  },
  {
    label: 'reverse muted pair that previously failed',
    backgrounds: {
      light: 'bg-slate-50',
      dark: 'dark:bg-slate-900',
    },
    before: {
      light: 'text-slate-400',
      dark: 'dark:text-slate-500',
    },
    after: {
      light: 'text-slate-500',
      dark: 'dark:text-slate-300',
    },
    expectedBeforeFailures: ['light', 'dark'],
  },
]

function parseClassToken(token: string) {
  const normalized = token.replace(/^dark:/, '')
  if (normalized === 'bg-white') {
    return '#ffffff'
  }

  const match = normalized.match(/^(?:text|bg)-([a-z]+)-(\d{2,3})$/)
  if (!match) {
    throw new Error(`Unsupported Tailwind token: ${token}`)
  }

  const [, palette, shade] = match
  const paletteColors = colors[palette as keyof typeof colors]

  if (!paletteColors || typeof paletteColors !== 'object' || !(shade in paletteColors)) {
    throw new Error(`Unknown Tailwind color: ${token}`)
  }

  return paletteColors[shade as keyof typeof paletteColors]
}

function toLinearRgb(colorToken: string) {
  const color = parseClassToken(colorToken)

  if (color.startsWith('#')) {
    const hex = color.replace('#', '')
    const value = parseInt(hex, 16)
    return {
      r: ((value >> 16) & 255) / 255,
      g: ((value >> 8) & 255) / 255,
      b: (value & 255) / 255,
    }
  }

  const match = color.match(/oklch\(([^%]+)%\s+([^\s]+)\s+([^)]+)\)/)
  if (!match) {
    throw new Error(`Unsupported color value: ${color}`)
  }

  const [, lRaw, cRaw, hRaw] = match
  const l = Number(lRaw) / 100
  const c = Number(cRaw)
  const h = (Number(hRaw) * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b

  const l3 = lPrime ** 3
  const m3 = mPrime ** 3
  const s3 = sPrime ** 3

  return {
    r: clamp(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: clamp(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: clamp(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function getRelativeLuminance(colorToken: string) {
  const { r, g, b } = toLinearRgb(colorToken)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function getContrastRatio(foregroundToken: string, backgroundToken: string) {
  const foreground = getRelativeLuminance(foregroundToken)
  const background = getRelativeLuminance(backgroundToken)
  const [lighter, darker] = [foreground, background].sort((left, right) => right - left)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('contrast pair audit', () => {
  it.each(auditedPairs)('$label stays WCAG AA after the slate microtune', ({ backgrounds, after }) => {
    expect(getContrastRatio(after.light, backgrounds.light)).toBeGreaterThanOrEqual(WCAG_AA_MIN)
    expect(getContrastRatio(after.dark, backgrounds.dark)).toBeGreaterThanOrEqual(WCAG_AA_MIN)
  })

  it.each(auditedPairs.filter((pair) => pair.expectedBeforeFailures.length > 0))(
    '$label documents the pre-fix regression',
    ({ backgrounds, before, expectedBeforeFailures }) => {
      const lightContrast = getContrastRatio(before.light, backgrounds.light)
      const darkContrast = getContrastRatio(before.dark, backgrounds.dark)

      if (expectedBeforeFailures.includes('light')) {
        expect(lightContrast).toBeLessThan(WCAG_AA_MIN)
      }

      if (expectedBeforeFailures.includes('dark')) {
        expect(darkContrast).toBeLessThan(WCAG_AA_MIN)
      }
    },
  )
})
