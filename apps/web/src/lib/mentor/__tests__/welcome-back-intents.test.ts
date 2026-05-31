import { describe, expect, it } from 'vitest'
import {
  WELCOME_BACK_INTENTS,
  formatTodayIntent,
} from '@/lib/mentor/welcome-back-intents'

describe('welcome-back-intents', () => {
  it('defines the three supported welcome-back intents', () => {
    expect(WELCOME_BACK_INTENTS).toEqual([
      {
        id: 'quick_win',
        label: '短時間で1問だけ',
        emoji: '⚡',
      },
      {
        id: 'deep_focus',
        label: 'じっくり1レッスン',
        emoji: '🎯',
      },
      {
        id: 'review',
        label: 'まずは復習から',
        emoji: '🔁',
      },
    ])
  })

  it('formats quick_win deterministically', () => {
    expect(formatTodayIntent('quick_win')).toBe('短時間で 1 問だけ解きたい')
  })

  it('formats deep_focus deterministically', () => {
    expect(formatTodayIntent('deep_focus')).toBe('じっくり 1 レッスン進めたい')
  })

  it('formats review deterministically and falls back to empty for unknown values', () => {
    expect(formatTodayIntent('review')).toBe('まずは復習から始めたい')
    expect(formatTodayIntent('unknown')).toBe('')
  })
})
