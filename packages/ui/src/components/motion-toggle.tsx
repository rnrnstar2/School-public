'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Sparkles } from 'lucide-react'
import { cn } from '../lib/utils'
import { themeMotion } from '../theme-motion'
import { useThemePreferences } from '../theme-provider'

export function MotionToggle({ className }: { className?: string }) {
  const { mounted, motionPreference, toggleMotionPreference } = useThemePreferences()
  const reduced = motionPreference === 'reduced'

  if (!mounted) {
    return <div aria-hidden className={cn('theme-icon-button opacity-0', className)} />
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={reduced ? undefined : { scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      transition={themeMotion.fade}
      onClick={toggleMotionPreference}
      className={cn('theme-icon-button', reduced && 'bg-accent text-foreground', className)}
      aria-label={reduced ? 'アニメーションを標準に戻す' : 'アニメーションを控えめにする'}
      title={reduced ? 'アニメーション: 控えめ' : 'アニメーション: 標準'}
      type="button"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={motionPreference}
          initial={{ y: -10, opacity: 0, rotate: -90 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: 10, opacity: 0, rotate: 90 }}
          transition={themeMotion.fade}
        >
          {reduced ? <Pause className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  )
}
