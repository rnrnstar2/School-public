'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { cn } from '../lib/utils'
import { themeMotion } from '../theme-motion'
import { useTheme } from '../use-theme'

export function ThemeToggle({ className }: { className?: string }) {
  const { mounted, theme, toggleTheme } = useTheme()

  if (!mounted) {
    return <div aria-hidden className={cn('theme-icon-button opacity-0', className)} />
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      transition={themeMotion.fade}
      onClick={toggleTheme}
      className={cn('theme-icon-button', className)}
      aria-label="テーマ切替"
      type="button"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ y: -10, opacity: 0, rotate: -90 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: 10, opacity: 0, rotate: 90 }}
          transition={themeMotion.fade}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  )
}
