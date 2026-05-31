export type WelcomeBackIntentId = 'quick_win' | 'deep_focus' | 'review'

export const WELCOME_BACK_INTENTS = [
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
] as const satisfies ReadonlyArray<{
  id: WelcomeBackIntentId
  label: string
  emoji: string
}>

export function formatTodayIntent(intent: WelcomeBackIntentId | string | null | undefined): string {
  switch (intent) {
    case 'quick_win':
      return '短時間で 1 問だけ解きたい'
    case 'deep_focus':
      return 'じっくり 1 レッスン進めたい'
    case 'review':
      return 'まずは復習から始めたい'
    default:
      return ''
  }
}
