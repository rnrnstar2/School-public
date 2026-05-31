import { Info, AlertTriangle, Lightbulb, HelpCircle } from 'lucide-react'
import type { CalloutBlockContent } from './types'

interface CalloutBlockProps {
  content: CalloutBlockContent
}

const VARIANT_STYLES = {
  info: {
    border: 'border-blue-200 dark:border-blue-800',
    bg: 'bg-blue-50/80 dark:bg-blue-950/30',
    icon: 'text-blue-600 dark:text-blue-400',
    title: 'text-blue-800 dark:text-blue-200',
    text: 'text-blue-900 dark:text-blue-100',
    label: '情報',
    Icon: Info,
  },
  warning: {
    border: 'border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50/80 dark:bg-amber-950/30',
    icon: 'text-amber-600 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-200',
    text: 'text-amber-900 dark:text-amber-100',
    label: '注意',
    Icon: AlertTriangle,
  },
  tip: {
    border: 'border-emerald-200 dark:border-emerald-800',
    bg: 'bg-emerald-50/80 dark:bg-emerald-950/30',
    icon: 'text-emerald-600 dark:text-emerald-400',
    title: 'text-emerald-800 dark:text-emerald-200',
    text: 'text-emerald-900 dark:text-emerald-100',
    label: 'ヒント',
    Icon: Lightbulb,
  },
  why: {
    border: 'border-purple-200 dark:border-purple-800',
    bg: 'bg-purple-50/80 dark:bg-purple-950/30',
    icon: 'text-purple-600 dark:text-purple-400',
    title: 'text-purple-800 dark:text-purple-200',
    text: 'text-purple-900 dark:text-purple-100',
    label: 'なぜ?',
    Icon: HelpCircle,
  },
} as const

export function CalloutBlock({ content }: CalloutBlockProps) {
  const style = VARIANT_STYLES[content.variant] ?? VARIANT_STYLES.info
  const { Icon } = style

  return (
    <div className={`rounded-[24px] border p-5 ${style.border} ${style.bg}`}>
      <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${style.title}`}>
        <Icon className={`h-4 w-4 ${style.icon}`} aria-hidden="true" />
        {style.label}
      </div>
      <p className={`text-sm leading-7 ${style.text}`}>
        {content.text}
      </p>
    </div>
  )
}
