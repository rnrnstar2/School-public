'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { clearRestoreCache, restoreSnapshotsFromDB } from '@/lib/planner/workspace-sync'
import Link from 'next/link'
import { MotionToggle } from '@school/ui/motion-toggle'
import { ThemeToggle } from '@school/ui/theme-toggle'
import { PreviewModeBadge } from '@/components/auth/preview-mode-badge'
import NotificationCenter from '@/components/navigation/notification-center'
import {
  Bot,
  Menu,
  X,
  LogOut,
  LogIn,
  Compass,
  GraduationCap,
  Search,
  User,
  ChevronDown,
  Settings,
} from 'lucide-react'
import { MentorChatSidebar } from '@/components/chat/mentor-chat-sidebar'

const navLinks = [
  { href: '/plan', label: 'プラン', icon: Compass },
  { href: '/lessons', label: 'レッスンを探す', icon: Search },
]

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mentorChatOpen, setMentorChatOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Listen for custom open-mentor-chat events from anywhere in the app
  useEffect(() => {
    function handleOpenMentorChat() {
      setMentorChatOpen(true)
    }
    window.addEventListener('open-mentor-chat', handleOpenMentorChat)
    return () => window.removeEventListener('open-mentor-chat', handleOpenMentorChat)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null)
      setIsAuthenticated(!!user)

      // Restore workspace snapshots from DB if already logged in
      if (user) {
        restoreSnapshotsFromDB().catch(() => {})
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setEmail(session?.user?.email ?? null)
      setIsAuthenticated(!!session?.user)

      // Restore workspace snapshots from DB on login
      if (event === 'SIGNED_IN' && session?.user) {
        restoreSnapshotsFromDB().catch(() => {})
      }

      // Drop the session-level restore cache so a next user gets a fresh read.
      if (event === 'SIGNED_OUT') {
        clearRestoreCache()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ユーザーメニュー外クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="theme-nav-surface fixed inset-x-0 top-0 z-50 h-16 border-b"
        role="banner"
      >
        <div className="max-w-7xl mx-auto h-full px-4 flex items-center justify-between">
          {/* ロゴ */}
          <Link href="/plan" className="flex items-center gap-2 group" aria-label="School ホーム">
            <motion.div
              whileHover={{ rotate: 12, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400 }}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-orange-500/25"
            >
              <GraduationCap className="w-5 h-5 text-white" />
            </motion.div>
            <span className="text-xl font-bold bg-gradient-to-r from-orange-600 to-cyan-600 bg-clip-text text-transparent">
              School
            </span>
          </Link>

          {/* デスクトップナビ */}
          <nav className="hidden md:flex items-center gap-1" aria-label="メインナビゲーション">
            {navLinks.map((link) => {
              const Icon = link.icon
              const active = isActive(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className="relative px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded-lg"
                >
                  {active && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 bg-orange-50 dark:bg-orange-900/20 rounded-lg"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span
                    className={`relative flex items-center gap-2 ${
                      active
                        ? 'text-orange-700 dark:text-orange-300'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {link.label}
                  </span>
                </Link>
              )
            })}
          </nav>

          {/* 右側アクション */}
          <div className="flex items-center gap-2">
            {/* メンターチャットボタン */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setMentorChatOpen(true)}
              className="relative flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:h-9 md:w-9"
              aria-label="メンターに相談"
            >
              <Bot className="h-5 w-5" />
            </motion.button>

            {/* プレビューモードバッジ */}
            {!isAuthenticated && <PreviewModeBadge />}

            <MotionToggle />

            {/* ダークモード切替 */}
            <ThemeToggle />

            {/* 通知センター（認証済みのみ） */}
            {isAuthenticated && <NotificationCenter />}

            {/* 認証済みユーザーメニュー（デスクトップ） */}
            {isAuthenticated ? (
              <div className="hidden md:block relative" ref={userMenuRef}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && userMenuOpen) {
                      setUserMenuOpen(false)
                    }
                  }}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  aria-label="ユーザーメニュー"
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-cyan-500 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <span className="max-w-[120px] truncate text-sm text-muted-foreground">
                    {email?.split('@')[0] || 'user'}
                  </span>
                  <motion.div
                    animate={{ rotate: userMenuOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    aria-hidden="true"
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </motion.button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      role="menu"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setUserMenuOpen(false)
                        }
                      }}
                      className="theme-popover absolute right-0 mt-2 w-56 overflow-hidden rounded-xl"
                    >
                      <div className="border-b border-border/70 px-4 py-3">
                        <p className="truncate text-sm font-medium text-foreground">
                          {email}
                        </p>
                      </div>
                      <div className="p-1.5">
                        <Link
                          href="/settings"
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground rounded-lg hover:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <Settings className="w-4 h-4" aria-hidden="true" />
                          アカウント設定
                        </Link>
                        <button
                          role="menuitem"
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <LogOut className="w-4 h-4" aria-hidden="true" />
                          ログアウト
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* 未認証ユーザー: ログインリンク（デスクトップ） */
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  ログイン
                </Link>
                <Link
                  href="/signup"
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  新規登録
                </Link>
              </div>
            )}

            {/* モバイルハンバーガー */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setMobileOpen(!mobileOpen)}
              className="theme-icon-button md:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label="メニュー"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={mobileOpen ? 'close' : 'open'}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </motion.div>
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* モバイルナビオーバーレイ */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              id="mobile-nav"
              role="dialog"
              aria-label="ナビゲーションメニュー"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setMobileOpen(false)
                }
              }}
              className="theme-panel-strong fixed bottom-0 right-0 top-0 z-50 w-72 rounded-none border-l shadow-2xl md:hidden"
            >
              <div className="flex flex-col h-full">
                {/* モバイルヘッダー */}
                <div className="flex items-center justify-between border-b border-border/70 p-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-cyan-500 flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <span className="truncate text-sm font-medium text-foreground">
                      {isAuthenticated ? (email?.split('@')[0] || 'user') : 'ゲスト'}
                    </span>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setMobileOpen(false)}
                    className="theme-icon-button size-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label="メニューを閉じる"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>

                {/* モバイルナビリンク */}
                <nav className="flex-1 p-4 space-y-1" aria-label="モバイルナビゲーション">
                  {navLinks.map((link, i) => {
                    const Icon = link.icon
                    const active = isActive(link.href)
                    return (
                      <motion.div
                        key={link.href}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Link
                          href={link.href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none touch-target ${
                            active
                              ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                        >
                          <Icon className="w-5 h-5" aria-hidden="true" />
                          {link.label}
                        </Link>
                      </motion.div>
                    )
                  })}
                </nav>

                {/* モバイルフッター */}
                <div className="space-y-2 border-t border-border/70 p-4">
                  {isAuthenticated ? (
                    <>
                      <p className="truncate px-4 text-xs text-muted-foreground">{email}</p>
                      <Link
                        href="/settings"
                        onClick={() => setMobileOpen(false)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground rounded-xl hover:bg-accent transition-colors touch-target"
                      >
                        <Settings className="w-5 h-5" />
                        アカウント設定
                      </Link>
                      <button
                        onClick={() => {
                          setMobileOpen(false)
                          handleSignOut()
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors touch-target"
                      >
                        <LogOut className="w-5 h-5" />
                        ログアウト
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setMobileOpen(false)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-foreground rounded-xl hover:bg-accent transition-colors touch-target"
                      >
                        <LogIn className="w-5 h-5" />
                        ログイン
                      </Link>
                      <Link
                        href="/signup"
                        onClick={() => setMobileOpen(false)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-sm hover:opacity-90 transition-opacity touch-target"
                      >
                        新規登録
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* メンターチャットサイドバー */}
      <MentorChatSidebar open={mentorChatOpen} onClose={() => setMentorChatOpen(false)} />
    </>
  )
}
