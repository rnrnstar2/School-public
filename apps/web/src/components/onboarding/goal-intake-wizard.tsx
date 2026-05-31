'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, SkipForward } from 'lucide-react'
import { Button } from '@school/ui/button'
import { Card, CardContent } from '@school/ui/card'
import { AI_TOOL_OPTIONS } from '@/lib/atoms/ai-tools-catalog'
import { cn } from '@/lib/utils'
import { GoalSuggestions } from './goal-suggestions'
import { StepIndicator } from './step-indicator'

// ── Types ──

export interface GoalIntakeResult {
  goal: string
  tools: string[]
  os: string
  cliFamiliarity: string
  programmingExperience: string
  aiExperience: string
  audience?: string
  deadline?: string
}

export interface GoalIntakeWizardProps {
  onComplete: (result: GoalIntakeResult) => void
  onCancel?: () => void
  initialGoal?: string
}

interface GoalIntakeState {
  step: 0 | 1 | 2 | 3 | 4
  goal: string
  tools: string[]
  os: string
  cliFamiliarity: 'none' | 'basic' | 'comfortable'
  programmingExperience: 'none' | 'beginner' | 'experienced'
  aiExperience: 'none' | 'casual' | 'daily'
  audience: string
  deadline: string
}

// ── Constants ──

/**
 * Tool options rendered in step 2 come from the canonical AI tools catalog
 * (`@/lib/atoms/ai-tools-catalog`) so that the wizard and `AiToolLaunchCard`
 * stay in lock-step when tools are added/removed.
 */
const TOOL_OPTIONS = AI_TOOL_OPTIONS

const OS_OPTIONS = [
  { value: 'mac', label: 'Mac' },
  { value: 'windows', label: 'Windows' },
  { value: 'other', label: 'その他' },
] as const

const CLI_OPTIONS = [
  { value: 'comfortable', label: 'はい' },
  { value: 'basic', label: '少しだけ' },
  { value: 'none', label: 'いいえ' },
] as const

const PROGRAMMING_OPTIONS = [
  {
    value: 'none',
    label: '全くの初めて',
    description: '何かを作るのは今回が初めてです',
  },
  {
    value: 'beginner',
    label: '少し経験あり',
    description: 'ブログやSNS運営、ノーコードツール等を使ったことがあります',
  },
  {
    value: 'experienced',
    label: '制作経験あり',
    description: 'Webサイトやアプリを作ったことがあります（手段は問わない）',
  },
] as const

const AUDIENCE_OPTIONS = [
  { value: '自分用', label: '自分用' },
  { value: '友人・家族向け', label: '友人・家族向け' },
  { value: '顧客・クライアント向け', label: '顧客・クライアント向け' },
  { value: 'チーム・社内向け', label: 'チーム・社内向け' },
] as const

const DEADLINE_OPTIONS = [
  { value: '特に急がない', label: '特に急がない' },
  { value: '1ヶ月以内', label: '1ヶ月以内' },
  { value: '2週間以内', label: '2週間以内' },
  { value: '1週間以内', label: '1週間以内' },
] as const

// ── Animation variants ──

const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
  }),
}

const pageTransition = {
  duration: 0.25,
  ease: 'easeInOut' as const,
}

// ── Subcomponents ──

function RadioOption({
  name,
  value,
  label,
  description,
  checked,
  onChange,
}: {
  name: string
  value: string
  label: string
  description?: string
  checked: boolean
  onChange: (value: string) => void
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all',
        'hover:border-primary/40 hover:bg-primary/5',
        'focus-within:ring-2 focus-within:ring-ring',
        checked
          ? 'border-primary bg-primary/10 font-medium text-primary dark:bg-primary/15'
          : 'border-border bg-background text-foreground',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          checked ? 'border-primary' : 'border-muted-foreground/40',
        )}
        aria-hidden="true"
      >
        {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span>{label}</span>
        {description && (
          <span className="text-xs font-normal text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}

function CheckboxOption({
  value,
  label,
  checked,
  onChange,
}: {
  value: string
  label: string
  checked: boolean
  onChange: (value: string, checked: boolean) => void
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all',
        'hover:border-primary/40 hover:bg-primary/5',
        'focus-within:ring-2 focus-within:ring-ring',
        checked
          ? 'border-primary bg-primary/10 font-medium text-primary dark:bg-primary/15'
          : 'border-border bg-background text-foreground',
      )}
    >
      <input
        type="checkbox"
        value={value}
        checked={checked}
        onChange={(e) => onChange(value, e.target.checked)}
        className="sr-only"
      />
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
          checked ? 'border-primary bg-primary' : 'border-muted-foreground/40',
        )}
        aria-hidden="true"
      >
        {checked && <Check className="h-3 w-3 text-primary-foreground" />}
      </span>
      {label}
    </label>
  )
}

function optionLabel<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value
}

// ── Main Component ──

export function GoalIntakeWizard({ onComplete, onCancel, initialGoal }: GoalIntakeWizardProps) {
  const [state, setState] = useState<GoalIntakeState>({
    step: 0,
    goal: initialGoal ?? '',
    tools: [],
    os: '',
    cliFamiliarity: 'none',
    programmingExperience: 'none',
    aiExperience: 'none',
    audience: '',
    deadline: '',
  })

  const [direction, setDirection] = useState(0)
  const goalInputRef = useRef<HTMLTextAreaElement>(null)
  const stepContainerRef = useRef<HTMLDivElement>(null)

  // Focus the primary action on each step:
  //  - step 0: the intro "はじめる" button (queried by data-attribute)
  //  - step 1: the goal textarea
  useEffect(() => {
    if (state.step === 0) {
      const cta = stepContainerRef.current?.querySelector<HTMLButtonElement>(
        '[data-intake-intro-cta="true"]',
      )
      cta?.focus()
    } else if (state.step === 1) {
      goalInputRef.current?.focus()
    }
  }, [state.step])

  // Focus management between steps
  useEffect(() => {
    stepContainerRef.current?.focus()
  }, [state.step])

  const goTo = useCallback((step: GoalIntakeState['step'], dir: 1 | -1 = 1) => {
    setDirection(dir)
    setState((prev) => ({ ...prev, step }))
  }, [])

  const handleToolToggle = useCallback((tool: string, checked: boolean) => {
    setState((prev) => ({
      ...prev,
      tools: checked ? [...prev.tools, tool] : prev.tools.filter((t) => t !== tool),
    }))
  }, [])

  const handleComplete = useCallback(() => {
    onComplete({
      goal: state.goal,
      tools: state.tools,
      os: state.os,
      cliFamiliarity: state.cliFamiliarity,
      programmingExperience: state.programmingExperience,
      aiExperience: state.aiExperience,
      audience: state.audience || undefined,
      deadline: state.deadline || undefined,
    })
  }, [state, onComplete])

  const toolLabel = (value: string) =>
    TOOL_OPTIONS.find((o) => o.value === value)?.label ?? value

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      {/* Step Indicator */}
      <StepIndicator
        currentStep={state.step}
        className="mb-6 sm:mb-8"
      />

      {/* Step Content */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 sm:p-8">
          <div
            ref={stepContainerRef}
            tabIndex={-1}
            className="outline-none"
            aria-live="polite"
          >
            <AnimatePresence mode="wait" custom={direction}>
              {/* ── Step 0: Intro / Explanation ── */}
              {state.step === 0 && (
                <motion.div
                  key="step-0"
                  custom={direction}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={pageTransition}
                  role="region"
                  aria-labelledby="intake-intro-heading"
                >
                  <h2
                    id="intake-intro-heading"
                    className="text-xl font-semibold sm:text-2xl"
                  >
                    これから 3〜5 分で、あなたの目標を一緒に言語化します
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    かんたんな質問にいくつか答えるだけで、あなた専用の学習プランを作ります。
                  </p>

                  <ul className="mt-5 space-y-3 text-sm leading-relaxed text-foreground">
                    <li className="flex gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                      >
                        1
                      </span>
                      <span>
                        何を作りたいか / どんな業務を AI で楽にしたいかを教えてもらいます
                      </span>
                    </li>
                    <li className="flex gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                      >
                        2
                      </span>
                      <span>
                        今の環境と経験を教えてもらい、あなた専用の学習プランを作ります
                      </span>
                    </li>
                    <li className="flex gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                      >
                        3
                      </span>
                      <span>
                        途中で変更できるので、完璧な答えでなくて大丈夫です
                      </span>
                    </li>
                  </ul>

                  <div className="mt-8 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {onCancel ? (
                      <Button variant="ghost" onClick={onCancel} size="sm" className="h-11 min-w-11 px-4">
                        キャンセル
                      </Button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
                      <Link
                        href="/plan/preview"
                        className={cn(
                          'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground underline-offset-4',
                          'hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        先にサンプルプランを見る
                      </Link>
                      <Button
                        data-intake-intro-cta="true"
                        onClick={() => goTo(1)}
                        size="lg"
                      >
                        はじめる
                        <ArrowRight className="ml-1 h-4 w-4" data-icon="inline-end" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Step 1: Goal Input ── */}
              {state.step === 1 && (
                <motion.div
                  key="step-1"
                  custom={direction}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={pageTransition}
                >
                  <h2 className="text-xl font-semibold sm:text-2xl">
                    何を作りたいですか？
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    あなたの目標を教えてください。AIが最適な学習プランを作成します。
                  </p>

                  <textarea
                    ref={goalInputRef}
                    value={state.goal}
                    onChange={(e) => setState((prev) => ({ ...prev, goal: e.target.value }))}
                    placeholder="例: ポートフォリオサイトを作りたい、業務のメール返信を自動化したい..."
                    rows={3}
                    aria-label="ゴール入力"
                    className={cn(
                      'mt-5 w-full resize-none rounded-lg border border-border bg-background px-4 py-3',
                      'text-base leading-relaxed text-foreground placeholder:text-muted-foreground',
                      'transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring',
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && state.goal.trim()) {
                        e.preventDefault()
                        goTo(2)
                      }
                    }}
                  />

                  <div className="mt-5">
                    <p
                      className={cn(
                        'mb-2 text-xs font-medium text-muted-foreground transition-opacity duration-300 ease-out',
                        state.goal.trim().length >= 6
                          ? 'opacity-0'
                          : 'opacity-100',
                      )}
                      aria-hidden={state.goal.trim().length >= 6 || undefined}
                    >
                      または候補から選択:
                    </p>
                    {/*
                      TQ-124-01: Fade the example goal chips once the user has
                      started typing a real goal (>=6 chars ≈ "conversation has
                      started"). Keeps the DOM mounted so the CSS transition is
                      smooth rather than a snap unmount.
                    */}
                    <GoalSuggestions
                      fadedOut={state.goal.trim().length >= 6}
                      onSelect={(goal) => {
                        setState((prev) => ({ ...prev, goal }))
                        // Advance after a brief delay so user sees selection
                        setTimeout(() => goTo(2), 150)
                      }}
                    />
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <Button variant="ghost" onClick={() => goTo(0, -1)} size="sm">
                      <ArrowLeft className="mr-1 h-4 w-4" data-icon="inline-start" />
                      戻る
                    </Button>
                    {/*
                      TQ-126-01: primary plan-submit.
                      以前は `disabled={!state.goal.trim()}` だったため、
                      ゴール未入力のユーザーが click すると TQ-120 の
                      BlockedClickTracker に blocked event が累積し、
                      なぜ進めないかの手がかりも得られなかった。
                      修正後は disabled を外し、click 時に empty なら
                      textarea にフォーカスを戻して helper text で案内する。
                      これにより blocked event は発火せず、ユーザーは
                      「ゴールを入力すると次へ進めます」を読んで即座に
                      次の一手（入力）が分かる。
                    */}
                    <div className="ml-auto flex flex-col items-end gap-1.5">
                      <Button
                        data-testid="plan-submit"
                        onClick={() => {
                          if (!state.goal.trim()) {
                            goalInputRef.current?.focus()
                            return
                          }
                          goTo(2)
                        }}
                        aria-describedby="plan-submit-helper"
                        size="lg"
                      >
                        次へ
                        <ArrowRight className="ml-1 h-4 w-4" data-icon="inline-end" />
                      </Button>
                      <p
                        id="plan-submit-helper"
                        role="status"
                        className={cn(
                          'text-xs text-muted-foreground transition-opacity duration-200 ease-out',
                          state.goal.trim()
                            ? 'opacity-0'
                            : 'opacity-100',
                        )}
                        aria-hidden={Boolean(state.goal.trim()) || undefined}
                      >
                        ゴールを入力すると次へ進めます
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Tool & Environment ── */}
              {state.step === 2 && (
                <motion.div
                  key="step-2"
                  custom={direction}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={pageTransition}
                >
                  <h2 className="text-xl font-semibold sm:text-2xl">
                    使えるツールはありますか？
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    お使いの環境を教えてください。スキップも可能です。
                  </p>

                  {/* Tools */}
                  <fieldset className="mt-5">
                    <legend className="mb-2 text-sm font-medium">
                      使用しているAIツール（複数選択可）
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {TOOL_OPTIONS.map((option) => (
                        <CheckboxOption
                          key={option.value}
                          value={option.value}
                          label={option.label}
                          checked={state.tools.includes(option.value)}
                          onChange={handleToolToggle}
                        />
                      ))}
                    </div>
                  </fieldset>

                  {/* OS */}
                  <fieldset className="mt-5">
                    <legend className="mb-2 text-sm font-medium">PCの種類は？</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {OS_OPTIONS.map((option) => (
                        <RadioOption
                          key={option.value}
                          name="os"
                          value={option.value}
                          label={option.label}
                          checked={state.os === option.value}
                          onChange={(v) => setState((prev) => ({ ...prev, os: v }))}
                        />
                      ))}
                    </div>
                  </fieldset>

                  {/* CLI */}
                  <fieldset className="mt-5">
                    <legend className="mb-2 text-sm font-medium">
                      コマンドラインは使えますか？
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                      {CLI_OPTIONS.map((option) => (
                        <RadioOption
                          key={option.value}
                          name="cli"
                          value={option.value}
                          label={option.label}
                          checked={state.cliFamiliarity === option.value}
                          onChange={(v) =>
                            setState((prev) => ({
                              ...prev,
                              cliFamiliarity: v as GoalIntakeState['cliFamiliarity'],
                            }))
                          }
                        />
                      ))}
                    </div>
                  </fieldset>

                  <div className="mt-8 flex items-center justify-between">
                    <Button variant="ghost" onClick={() => goTo(1, -1)} size="sm">
                      <ArrowLeft className="mr-1 h-4 w-4" data-icon="inline-start" />
                      戻る
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => goTo(3)} size="sm">
                        <SkipForward className="mr-1 h-3.5 w-3.5" data-icon="inline-start" />
                        スキップ
                      </Button>
                      <Button onClick={() => goTo(3)} size="lg">
                        次へ
                        <ArrowRight className="ml-1 h-4 w-4" data-icon="inline-end" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Step 3: Experience Level ── */}
              {state.step === 3 && (
                <motion.div
                  key="step-3"
                  custom={direction}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={pageTransition}
                >
                  <h2 className="text-xl font-semibold sm:text-2xl">
                    制作経験と目的
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    制作経験と、誰のためにいつまでに作るかを教えてください。
                  </p>

                  {/* Programming Experience */}
                  <fieldset className="mt-5">
                    <legend className="mb-2 text-sm font-medium">
                      制作経験はどのくらいありますか？
                    </legend>
                    <div className="grid gap-2">
                      {PROGRAMMING_OPTIONS.map((option) => (
                        <RadioOption
                          key={option.value}
                          name="programming"
                          value={option.value}
                          label={option.label}
                          description={option.description}
                          checked={state.programmingExperience === option.value}
                          onChange={(v) =>
                            setState((prev) => ({
                              ...prev,
                              programmingExperience: v as GoalIntakeState['programmingExperience'],
                            }))
                          }
                        />
                      ))}
                    </div>
                  </fieldset>

                  {/* Audience */}
                  <fieldset className="mt-5">
                    <legend className="mb-2 text-sm font-medium">
                      誰のために作りますか？
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {AUDIENCE_OPTIONS.map((option) => (
                        <RadioOption
                          key={option.value}
                          name="audience"
                          value={option.value}
                          label={option.label}
                          checked={state.audience === option.value}
                          onChange={(v) => setState((prev) => ({ ...prev, audience: v }))}
                        />
                      ))}
                    </div>
                  </fieldset>

                  {/* Deadline */}
                  <fieldset className="mt-5">
                    <legend className="mb-2 text-sm font-medium">
                      いつまでに完成させたいですか？
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {DEADLINE_OPTIONS.map((option) => (
                        <RadioOption
                          key={option.value}
                          name="deadline"
                          value={option.value}
                          label={option.label}
                          checked={state.deadline === option.value}
                          onChange={(v) => setState((prev) => ({ ...prev, deadline: v }))}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <div className="mt-8 flex items-center justify-between">
                    <Button variant="ghost" onClick={() => goTo(2, -1)} size="sm">
                      <ArrowLeft className="mr-1 h-4 w-4" data-icon="inline-start" />
                      戻る
                    </Button>
                    <Button onClick={() => goTo(4)} size="lg">
                      次へ
                      <ArrowRight className="ml-1 h-4 w-4" data-icon="inline-end" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 4: Confirmation ── */}
              {state.step === 4 && (
                <motion.div
                  key="step-4"
                  custom={direction}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={pageTransition}
                >
                  <h2 className="text-xl font-semibold sm:text-2xl">
                    入力内容を確認してください
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    この内容をもとにAIが学習プランを作成します。
                  </p>

                  <div className="mt-5 space-y-3">
                    {/* Goal */}
                    <SummaryRow
                      label="ゴール"
                      value={state.goal}
                      onEdit={() => goTo(1, -1)}
                    />

                    {/* Tools */}
                    <SummaryRow
                      label="使用ツール"
                      value={
                        state.tools.length > 0
                          ? state.tools.map(toolLabel).join(', ')
                          : '未選択'
                      }
                      onEdit={() => goTo(2, -1)}
                    />

                    {/* OS */}
                    <SummaryRow
                      label="PC"
                      value={state.os ? optionLabel(OS_OPTIONS, state.os) : '未選択'}
                      onEdit={() => goTo(2, -1)}
                    />

                    {/* CLI */}
                    <SummaryRow
                      label="コマンドライン"
                      value={optionLabel(CLI_OPTIONS, state.cliFamiliarity)}
                      onEdit={() => goTo(2, -1)}
                    />

                    {/* Programming */}
                    <SummaryRow
                      label="制作経験"
                      value={optionLabel(PROGRAMMING_OPTIONS, state.programmingExperience)}
                      onEdit={() => goTo(3, -1)}
                    />

                    {/* Audience */}
                    {state.audience.trim() && (
                      <SummaryRow
                        label="作る相手"
                        value={optionLabel(AUDIENCE_OPTIONS, state.audience)}
                        onEdit={() => goTo(3, -1)}
                      />
                    )}

                    {/* Deadline */}
                    {state.deadline.trim() && (
                      <SummaryRow
                        label="希望する完成時期"
                        value={optionLabel(DEADLINE_OPTIONS, state.deadline)}
                        onEdit={() => goTo(3, -1)}
                      />
                    )}
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <Button variant="ghost" onClick={() => goTo(3, -1)} size="sm">
                      <ArrowLeft className="mr-1 h-4 w-4" data-icon="inline-start" />
                      戻る
                    </Button>
                    <Button onClick={handleComplete} size="lg">
                      <Check className="mr-1 h-4 w-4" data-icon="inline-start" />
                      この内容でプランを作成する
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Summary Row ──

function SummaryRow({
  label,
  value,
  onEdit,
}: {
  label: string
  value: string
  onEdit: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          'shrink-0 text-xs font-medium text-primary transition-colors',
          'hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded',
        )}
        aria-label={`${label}を修正する`}
      >
        修正する
      </button>
    </div>
  )
}
