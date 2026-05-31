'use client'

import { useCallback, useState } from 'react'

// ── Types ──

type LessonBlockType =
  | 'markdown'
  | 'image'
  | 'video'
  | 'callout'
  | 'checklist'
  | 'quiz'
  | 'code_prompt'
  | 'reflection'
  | 'rubric'
  | 'artifact_submit'

interface LessonBlock {
  id: string
  lesson_version_id: string
  type: LessonBlockType
  sort_order: number
  content: Record<string, unknown>
  created_at: string
}

interface BlockEditorProps {
  blocks: LessonBlock[]
  onChange: (blocks: LessonBlock[]) => void
}

// ── Constants ──

const BLOCK_TYPES: { value: LessonBlockType; label: string; icon: string }[] = [
  { value: 'markdown', label: 'Markdown', icon: 'M' },
  { value: 'image', label: '画像', icon: 'I' },
  { value: 'video', label: '動画', icon: 'V' },
  { value: 'callout', label: 'コールアウト', icon: 'C' },
  { value: 'checklist', label: 'チェックリスト', icon: 'L' },
  { value: 'quiz', label: 'クイズ', icon: 'Q' },
  { value: 'code_prompt', label: 'コードプロンプト', icon: '<>' },
  { value: 'reflection', label: 'リフレクション', icon: 'R' },
  { value: 'rubric', label: 'ルーブリック', icon: 'Ru' },
  { value: 'artifact_submit', label: '成果物提出', icon: 'A' },
]

const CALLOUT_VARIANTS = [
  { value: 'info', label: '情報', color: 'bg-blue-100 text-blue-700' },
  { value: 'warning', label: '警告', color: 'bg-amber-100 text-amber-700' },
  { value: 'tip', label: 'ヒント', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'why', label: 'なぜ？', color: 'bg-purple-100 text-purple-700' },
]

const CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'html', 'css', 'json', 'bash', 'sql']

const ARTIFACT_TYPES = ['url', 'repo', 'screenshot', 'text', 'file']

const TYPE_BADGE_COLORS: Record<LessonBlockType, string> = {
  markdown: 'bg-slate-100 text-slate-700',
  image: 'bg-indigo-100 text-indigo-700',
  video: 'bg-pink-100 text-pink-700',
  callout: 'bg-blue-100 text-blue-700',
  checklist: 'bg-teal-100 text-teal-700',
  quiz: 'bg-amber-100 text-amber-700',
  code_prompt: 'bg-violet-100 text-violet-700',
  reflection: 'bg-cyan-100 text-cyan-700',
  rubric: 'bg-orange-100 text-orange-700',
  artifact_submit: 'bg-emerald-100 text-emerald-700',
}

// ── Helpers ──

function generateId(): string {
  return crypto.randomUUID()
}

// ── Component ──

export function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const [showAddMenu, setShowAddMenu] = useState(false)

  const updateBlock = useCallback(
    (id: string, content: Record<string, unknown>) => {
      onChange(blocks.map((b) => (b.id === id ? { ...b, content } : b)))
    },
    [blocks, onChange],
  )

  const removeBlock = useCallback(
    (id: string) => {
      const updated = blocks
        .filter((b) => b.id !== id)
        .map((b, i) => ({ ...b, sort_order: i }))
      onChange(updated)
    },
    [blocks, onChange],
  )

  const moveBlock = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const idx = blocks.findIndex((b) => b.id === id)
      if (idx < 0) return
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= blocks.length) return
      const updated = [...blocks]
      ;[updated[idx], updated[target]] = [updated[target], updated[idx]]
      onChange(updated.map((b, i) => ({ ...b, sort_order: i })))
    },
    [blocks, onChange],
  )

  const addBlock = useCallback(
    (type: LessonBlockType) => {
      const newBlock: LessonBlock = {
        id: generateId(),
        lesson_version_id: blocks[0]?.lesson_version_id ?? '',
        type,
        sort_order: blocks.length,
        content: getDefaultContent(type),
        created_at: new Date().toISOString(),
      }
      onChange([...blocks, newBlock])
      setShowAddMenu(false)
    },
    [blocks, onChange],
  )

  const inputClass =
    'w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100'

  const textareaClass =
    'w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 font-mono'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          ブロックエディタ ({blocks.length} ブロック)
        </h3>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            + ブロック追加
          </button>
          {showAddMenu && (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              {BLOCK_TYPES.map((bt) => (
                <button
                  key={bt.value}
                  type="button"
                  onClick={() => addBlock(bt.value)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${TYPE_BADGE_COLORS[bt.value]}`}
                  >
                    {bt.icon}
                  </span>
                  {bt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {blocks.length === 0 && (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">ブロックがありません</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            「ブロック追加」ボタンからコンテンツブロックを追加してください。
          </p>
        </div>
      )}

      <div className="space-y-3">
        {blocks.map((block, idx) => (
          <div
            key={block.id}
            className="rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]"
          >
            {/* Block Header */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
              <span
                className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${TYPE_BADGE_COLORS[block.type]}`}
              >
                {BLOCK_TYPES.find((bt) => bt.value === block.type)?.label ?? block.type}
              </span>
              <span className="text-xs text-slate-400">#{idx + 1}</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveBlock(block.id, 'up')}
                  disabled={idx === 0}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  title="上に移動"
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(block.id, 'down')}
                  disabled={idx === blocks.length - 1}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  title="下に移動"
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(block.id)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  title="削除"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>

            {/* Block Content Editor */}
            <div className="p-5">
              {block.type === 'markdown' && (
                <MarkdownBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={textareaClass}
                />
              )}
              {block.type === 'image' && (
                <ImageBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                />
              )}
              {block.type === 'video' && (
                <VideoBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                />
              )}
              {block.type === 'callout' && (
                <CalloutBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                  textareaClass={textareaClass}
                />
              )}
              {block.type === 'checklist' && (
                <ChecklistBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                />
              )}
              {block.type === 'quiz' && (
                <QuizBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                  textareaClass={textareaClass}
                />
              )}
              {block.type === 'code_prompt' && (
                <CodePromptBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                  textareaClass={textareaClass}
                />
              )}
              {block.type === 'reflection' && (
                <ReflectionBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                  textareaClass={textareaClass}
                />
              )}
              {block.type === 'rubric' && (
                <RubricBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                />
              )}
              {block.type === 'artifact_submit' && (
                <ArtifactSubmitBlockEditor
                  content={block.content}
                  onChange={(c) => updateBlock(block.id, c)}
                  inputClass={inputClass}
                  textareaClass={textareaClass}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Default Content ──

function getDefaultContent(type: LessonBlockType): Record<string, unknown> {
  switch (type) {
    case 'markdown':
      return { body: '' }
    case 'image':
      return { url: '', alt: '', caption: '' }
    case 'video':
      return { url: '', caption: '' }
    case 'callout':
      return { variant: 'info', body: '' }
    case 'checklist':
      return { items: [''] }
    case 'quiz':
      return { question: '', options: [{ text: '', correct: false }], explanation: '' }
    case 'code_prompt':
      return { language: 'javascript', prompt: '', starter: '', solution: '' }
    case 'reflection':
      return { prompt: '', minLength: 50 }
    case 'rubric':
      return { criteria: [{ label: '', description: '' }] }
    case 'artifact_submit':
      return { prompt: '', acceptedTypes: ['url'] }
  }
}

// ── Block Type Editors ──

interface BlockContentProps {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
  inputClass: string
  textareaClass?: string
}

function MarkdownBlockEditor({ content, onChange, inputClass }: Omit<BlockContentProps, 'textareaClass'> & { inputClass: string }) {
  const [preview, setPreview] = useState(false)
  const body = (content.body as string) ?? ''

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Markdown コンテンツ</span>
        <button
          type="button"
          onClick={() => setPreview(!preview)}
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
        >
          {preview ? '編集に戻る' : 'プレビュー'}
        </button>
      </div>
      {preview ? (
        <div className="min-h-[120px] rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-700">
          {body || '(空)'}
        </div>
      ) : (
        <textarea
          rows={8}
          value={body}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          className={inputClass}
          placeholder="Markdown を入力..."
        />
      )}
    </div>
  )
}

function ImageBlockEditor({ content, onChange, inputClass }: Omit<BlockContentProps, 'textareaClass'>) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">画像 URL</span>
        <input
          value={(content.url as string) ?? ''}
          onChange={(e) => onChange({ ...content, url: e.target.value })}
          className={inputClass}
          placeholder="https://..."
        />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">Alt テキスト</span>
        <input
          value={(content.alt as string) ?? ''}
          onChange={(e) => onChange({ ...content, alt: e.target.value })}
          className={inputClass}
          placeholder="画像の説明..."
        />
      </label>
      <label className="space-y-2 lg:col-span-2">
        <span className="text-sm font-medium text-slate-700">キャプション</span>
        <input
          value={(content.caption as string) ?? ''}
          onChange={(e) => onChange({ ...content, caption: e.target.value })}
          className={inputClass}
          placeholder="キャプション（任意）"
        />
      </label>
    </div>
  )
}

function VideoBlockEditor({ content, onChange, inputClass }: Omit<BlockContentProps, 'textareaClass'>) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">動画 URL</span>
        <input
          value={(content.url as string) ?? ''}
          onChange={(e) => onChange({ ...content, url: e.target.value })}
          className={inputClass}
          placeholder="https://..."
        />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">キャプション</span>
        <input
          value={(content.caption as string) ?? ''}
          onChange={(e) => onChange({ ...content, caption: e.target.value })}
          className={inputClass}
          placeholder="キャプション（任意）"
        />
      </label>
    </div>
  )
}

function CalloutBlockEditor({ content, onChange, inputClass, textareaClass }: BlockContentProps) {
  const variant = (content.variant as string) ?? 'info'
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-700">バリアント</span>
        <div className="flex gap-3">
          {CALLOUT_VARIANTS.map((v) => (
            <label key={v.value} className="flex items-center gap-2">
              <input
                type="radio"
                name={`callout-variant-${content.body}`}
                checked={variant === v.value}
                onChange={() => onChange({ ...content, variant: v.value })}
                className="accent-emerald-600"
              />
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${v.color}`}>
                {v.label}
              </span>
            </label>
          ))}
        </div>
      </div>
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">テキスト</span>
        <textarea
          rows={4}
          value={(content.body as string) ?? ''}
          onChange={(e) => onChange({ ...content, body: e.target.value })}
          className={textareaClass ?? inputClass}
          placeholder="コールアウトの内容..."
        />
      </label>
    </div>
  )
}

function ChecklistBlockEditor({ content, onChange, inputClass }: Omit<BlockContentProps, 'textareaClass'>) {
  const items = (content.items as string[]) ?? ['']

  const updateItem = (idx: number, value: string) => {
    const next = [...items]
    next[idx] = value
    onChange({ ...content, items: next })
  }

  const addItem = () => onChange({ ...content, items: [...items, ''] })

  const removeItem = (idx: number) => {
    if (items.length <= 1) return
    onChange({ ...content, items: items.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-3">
      <span className="text-sm font-medium text-slate-700">チェックリスト項目</span>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{idx + 1}.</span>
          <input
            value={item}
            onChange={(e) => updateItem(idx, e.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="項目を入力..."
          />
          <button
            type="button"
            onClick={() => removeItem(idx)}
            disabled={items.length <= 1}
            className="rounded-lg p-1.5 text-slate-400 transition hover:text-red-600 disabled:opacity-30"
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
      >
        + 項目追加
      </button>
    </div>
  )
}

function QuizBlockEditor({ content, onChange, inputClass, textareaClass }: BlockContentProps) {
  const options = (content.options as Array<{ text: string; correct: boolean }>) ?? []

  const updateOption = (idx: number, patch: Partial<{ text: string; correct: boolean }>) => {
    const next = options.map((o, i) => (i === idx ? { ...o, ...patch } : o))
    onChange({ ...content, options: next })
  }

  const addOption = () =>
    onChange({ ...content, options: [...options, { text: '', correct: false }] })

  const removeOption = (idx: number) => {
    if (options.length <= 1) return
    onChange({ ...content, options: options.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-4">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">問題文</span>
        <textarea
          rows={3}
          value={(content.question as string) ?? ''}
          onChange={(e) => onChange({ ...content, question: e.target.value })}
          className={textareaClass ?? inputClass}
          placeholder="クイズの問題文..."
        />
      </label>

      <div className="space-y-3">
        <span className="text-sm font-medium text-slate-700">選択肢</span>
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <label className="flex items-center gap-1" title="正解にする">
              <input
                type="checkbox"
                checked={opt.correct}
                onChange={(e) => updateOption(idx, { correct: e.target.checked })}
                className="accent-emerald-600"
              />
              <span className="text-xs text-slate-500">正解</span>
            </label>
            <input
              value={opt.text}
              onChange={(e) => updateOption(idx, { text: e.target.value })}
              className={`${inputClass} flex-1`}
              placeholder={`選択肢 ${idx + 1}`}
            />
            <button
              type="button"
              onClick={() => removeOption(idx)}
              disabled={options.length <= 1}
              className="rounded-lg p-1.5 text-slate-400 transition hover:text-red-600 disabled:opacity-30"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addOption}
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          + 選択肢追加
        </button>
      </div>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">解説</span>
        <textarea
          rows={3}
          value={(content.explanation as string) ?? ''}
          onChange={(e) => onChange({ ...content, explanation: e.target.value })}
          className={textareaClass ?? inputClass}
          placeholder="正解の解説..."
        />
      </label>
    </div>
  )
}

function CodePromptBlockEditor({ content, onChange, inputClass, textareaClass }: BlockContentProps) {
  return (
    <div className="space-y-4">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">言語</span>
        <select
          value={(content.language as string) ?? 'javascript'}
          onChange={(e) => onChange({ ...content, language: e.target.value })}
          className={inputClass}
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">プロンプト（指示文）</span>
        <textarea
          rows={3}
          value={(content.prompt as string) ?? ''}
          onChange={(e) => onChange({ ...content, prompt: e.target.value })}
          className={textareaClass ?? inputClass}
          placeholder="学習者への指示..."
        />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">スターターコード</span>
        <textarea
          rows={5}
          value={(content.starter as string) ?? ''}
          onChange={(e) => onChange({ ...content, starter: e.target.value })}
          className={textareaClass ?? inputClass}
          placeholder="// 初期コード..."
        />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">模範解答</span>
        <textarea
          rows={5}
          value={(content.solution as string) ?? ''}
          onChange={(e) => onChange({ ...content, solution: e.target.value })}
          className={textareaClass ?? inputClass}
          placeholder="// 解答コード..."
        />
      </label>
    </div>
  )
}

function ReflectionBlockEditor({ content, onChange, inputClass, textareaClass }: BlockContentProps) {
  return (
    <div className="space-y-4">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">リフレクション プロンプト</span>
        <textarea
          rows={4}
          value={(content.prompt as string) ?? ''}
          onChange={(e) => onChange({ ...content, prompt: e.target.value })}
          className={textareaClass ?? inputClass}
          placeholder="学習者に考えてほしい問い..."
        />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">最小文字数</span>
        <input
          type="number"
          min={0}
          value={(content.minLength as number) ?? 50}
          onChange={(e) => onChange({ ...content, minLength: Number(e.target.value) })}
          className={`${inputClass} w-32`}
        />
      </label>
    </div>
  )
}

function RubricBlockEditor({ content, onChange, inputClass }: Omit<BlockContentProps, 'textareaClass'>) {
  const criteria = (content.criteria as Array<{ label: string; description: string }>) ?? []

  const updateCriterion = (idx: number, patch: Partial<{ label: string; description: string }>) => {
    const next = criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    onChange({ ...content, criteria: next })
  }

  const addCriterion = () =>
    onChange({ ...content, criteria: [...criteria, { label: '', description: '' }] })

  const removeCriterion = (idx: number) => {
    if (criteria.length <= 1) return
    onChange({ ...content, criteria: criteria.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-3">
      <span className="text-sm font-medium text-slate-700">評価基準</span>
      {criteria.map((c, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <span className="mt-3 text-xs text-slate-400">{idx + 1}.</span>
          <div className="flex flex-1 gap-2">
            <input
              value={c.label}
              onChange={(e) => updateCriterion(idx, { label: e.target.value })}
              className={`${inputClass} w-1/3`}
              placeholder="基準名"
            />
            <input
              value={c.description}
              onChange={(e) => updateCriterion(idx, { description: e.target.value })}
              className={`${inputClass} flex-1`}
              placeholder="基準の説明"
            />
          </div>
          <button
            type="button"
            onClick={() => removeCriterion(idx)}
            disabled={criteria.length <= 1}
            className="mt-3 rounded-lg p-1.5 text-slate-400 transition hover:text-red-600 disabled:opacity-30"
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addCriterion}
        className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
      >
        + 基準追加
      </button>
    </div>
  )
}

function ArtifactSubmitBlockEditor({ content, onChange, inputClass, textareaClass }: BlockContentProps) {
  const acceptedTypes = (content.acceptedTypes as string[]) ?? []

  return (
    <div className="space-y-4">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-700">提出プロンプト</span>
        <textarea
          rows={4}
          value={(content.prompt as string) ?? ''}
          onChange={(e) => onChange({ ...content, prompt: e.target.value })}
          className={textareaClass ?? inputClass}
          placeholder="成果物の提出指示..."
        />
      </label>
      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-700">受け入れ形式</span>
        <div className="flex flex-wrap gap-3">
          {ARTIFACT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={acceptedTypes.includes(t)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...acceptedTypes, t]
                    : acceptedTypes.filter((v) => v !== t)
                  onChange({ ...content, acceptedTypes: next })
                }}
                className="accent-emerald-600"
              />
              <span className="text-sm text-slate-700">{t}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Icons ──

function ArrowUpIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  )
}

function ArrowDownIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  )
}
