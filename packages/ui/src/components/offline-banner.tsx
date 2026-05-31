'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useNetworkStatus } from '../network-status'

/**
 * Global offline indicator banner. Place once in the app layout.
 * Automatically shows/hides based on navigator.onLine.
 */
export function OfflineBanner() {
  const { online } = useNetworkStatus()

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          key="offline-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-white dark:bg-amber-600">
            <WifiOff className="h-4 w-4" />
            オフラインです。ネットワーク接続を確認してください。
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
