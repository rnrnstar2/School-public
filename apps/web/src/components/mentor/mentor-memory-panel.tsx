'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Brain, Check, ChevronDown, ChevronRight, Pencil, Trash2, X } from 'lucide-react'
import type { MentorMemory } from '@/types'

interface MentorMemoryPanelProps {
  memories: MentorMemory[]
  onUpdate: (id: string, updates: { title?: string; bullets?: string[] }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function MentorMemoryPanel({ memories, onUpdate, onDelete }: MentorMemoryPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBullets, setEditBullets] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (memories.length === 0) return null

  const handleStartEdit = (memory: MentorMemory) => {
    setEditingId(memory.id)
    setEditBullets([...memory.bullets])
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditBullets([])
  }

  const handleSaveEdit = async (id: string) => {
    setSubmitting(true)
    try {
      await onUpdate(id, { bullets: editBullets.filter(Boolean) })
      setEditingId(null)
      setEditBullets([])
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await onDelete(id)
    } finally {
      setDeletingId(null)
    }
  }

  const handleBulletChange = (index: number, value: string) => {
    const updated = [...editBullets]
    updated[index] = value
    setEditBullets(updated)
  }

  const handleRemoveBullet = (index: number) => {
    setEditBullets(editBullets.filter((_, i) => i !== index))
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        )}
        <Brain className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-xs font-semibold tracking-[0.16em] text-slate-600 dark:text-slate-300">
          メンターの記憶
        </span>
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
          {memories.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
              AIメンターがあなたについて把握している情報です。誤りがあれば修正・削除できます。
            </p>
            <div className="mt-3 space-y-2">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="rounded-[14px] border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {memory.title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-300">
                        {memory.source === 'system' ? 'システム' : memory.source === 'planner' ? 'プランナー' : 'メンター'}
                        {' · '}
                        {new Date(memory.created_at).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                    {editingId !== memory.id && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(memory)}
                          className="touch-target rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-violet-600 dark:hover:bg-slate-800 dark:hover:text-violet-300"
                          aria-label={`「${memory.title}」を修正`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(memory.id)}
                          disabled={deletingId === memory.id}
                          className="touch-target rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                          aria-label={`「${memory.title}」を削除`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {editingId === memory.id ? (
                    <div className="mt-2 space-y-2">
                      {editBullets.map((bullet, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={bullet}
                            onChange={(e) => handleBulletChange(i, e.target.value)}
                            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-violet-300 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveBullet(i)}
                            className="touch-target rounded-lg p-2 text-slate-400 transition hover:text-red-500"
                            aria-label="この項目を削除"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(memory.id)}
                          disabled={submitting}
                          className="touch-target inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="touch-target inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    memory.bullets.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {memory.bullets.map((bullet, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
