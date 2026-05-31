'use client'

import type { ReactNode } from 'react'

import { ThemeToggle } from '@school/ui/theme-toggle'
import { cn } from '@school/ui/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Anchor,
  GraduationCap,
  History,
  LayoutDashboard,
  Lightbulb,
  Package,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { SignOutButton } from '@/components/admin/sign-out-button'

type NavigationIconKey =
  | 'dashboard'
  | 'atoms'
  | 'versions'
  | 'personas'
  | 'anchors'
  | 'improvements'

const NAVIGATION_ICONS: Record<NavigationIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  atoms: Package,
  versions: History,
  personas: Users,
  anchors: Anchor,
  improvements: Lightbulb,
}

const navigation = [
  { href: '/dashboard', label: 'Dashboard', iconKey: 'dashboard' },
  { href: '/admin/atoms', label: 'Atoms', iconKey: 'atoms' },
  { href: '/admin/atom-versions', label: 'Atom versions', iconKey: 'versions' },
  { href: '/admin/personas', label: 'Personas', iconKey: 'personas' },
  { href: '/admin/anchors', label: 'Anchors', iconKey: 'anchors' },
  { href: '/admin/improvement-proposals', label: 'Improvements', iconKey: 'improvements' },
] as const

export function AdminShell({
  children,
  userEmail,
}: {
  children: ReactNode
  userEmail: string
}) {
  const pathname = usePathname()

  return (
    <div className="theme-admin-shell">
      <div className="mx-auto grid min-h-screen max-w-[1600px] gap-6 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6 lg:py-6">
        <motion.aside
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          className="theme-sidebar-panel overflow-hidden"
        >
          <div className="border-b border-sidebar-border/70 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 via-cyan-300 to-sky-400 text-slate-950">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-sidebar-foreground/70">
                  School
                </p>
                <h1 className="text-xl font-semibold">Mentor Workspace Ops</h1>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-sidebar-foreground/70">
              Structured content operations for the goal-first learner platform.
            </p>
          </div>

          <nav className="space-y-2 p-4">
            {navigation.map((item) => {
              const Icon = NAVIGATION_ICONS[item.iconKey]
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-sm font-medium transition',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  {isActive ? (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-2xl bg-sidebar-primary"
                    />
                  ) : null}
                  <span className="relative flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto space-y-4 border-t border-sidebar-border/70 px-6 py-6">
            <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/30 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-sidebar-foreground/60">
                Signed in
              </p>
              <p className="mt-2 text-sm font-medium text-sidebar-foreground">{userEmail}</p>
            </div>
            <SignOutButton />
          </div>
        </motion.aside>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] border border-border/70 bg-[var(--surface-strong)] shadow-[0_25px_80px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <div className="flex items-center justify-end border-b border-border/70 px-5 py-4 sm:px-8">
            <ThemeToggle className="border border-border/70 bg-[var(--surface)] hover:bg-accent" />
          </div>
          <div className="h-full px-5 py-6 sm:px-8 sm:py-8">{children}</div>
        </motion.div>
      </div>
    </div>
  )
}
