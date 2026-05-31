'use client'

import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Anchor as AnchorIcon,
  BarChart3,
  BookOpen,
  FileCheck2,
  GitBranch,
  History,
  Layers3,
  Package,
  Send,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type MetricIconKey =
  | 'courses'
  | 'lessons'
  | 'assignments'
  | 'submissions'
  | 'analytics'
  | 'trending'
  | 'alert'
  | 'branch'
  | 'atoms'
  | 'versions'
  | 'personas'
  | 'anchors'

const ICONS: Record<MetricIconKey, LucideIcon> = {
  courses: Layers3,
  lessons: BookOpen,
  assignments: FileCheck2,
  submissions: Send,
  analytics: BarChart3,
  trending: TrendingUp,
  alert: AlertTriangle,
  branch: GitBranch,
  atoms: Package,
  versions: History,
  personas: Users,
  anchors: AnchorIcon,
}

export function MetricGrid({
  items,
}: {
  items: Array<{
    label: string
    value: string
    detail: string
    icon: MetricIconKey
    accent: string
  }>
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const Icon = ICONS[item.icon]

        return (
          <motion.article
            key={item.label}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * index }}
            className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm"
          >
            <div className={`inline-flex rounded-2xl p-3 ${item.accent}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-tight text-foreground">
              {item.value}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground/80">{item.label}</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </motion.article>
        )
      })}
    </div>
  )
}
