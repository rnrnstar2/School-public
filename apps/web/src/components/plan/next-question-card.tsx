'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle, MessageCircleQuestion, RefreshCcw, Sparkles } from 'lucide-react'

import { Button } from '@school/ui/button'
import { Card, CardContent } from '@school/ui/card'
import type { NextQuestionOutput } from '@/lib/api/schemas'
import { cn } from '@/lib/utils'

interface NextQuestionApiResponse {
  ok: boolean
  nextQuestion: NextQuestionOutput
}

interface NextQuestionAnswerApiResponse extends NextQuestionApiResponse {
  contextId: string
}

interface NextQuestionCardProps {
  goalId: string
  initialQuestion?: NextQuestionOutput
}

type ToastState = {
  tone: 'error'
  message: string
}

class NextQuestionRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'NextQuestionRequestError'
    this.status = status
  }
}

async function postJson<T>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    const message = typeof json?.message === 'string' ? json.message : 'request_failed'
    throw new NextQuestionRequestError(message, response.status)
  }

  return json as T
}

function NextQuestionCard({
  goalId,
  initialQuestion,
}: NextQuestionCardProps) {
  const [currentQuestion, setCurrentQuestion] = useState<NextQuestionOutput | null>(
    initialQuestion ?? null,
  )
  const [selectedChoice, setSelectedChoice] = useState('')
  const [freeformAnswer, setFreeformAnswer] = useState('')
  const [isLoading, setIsLoading] = useState(initialQuestion == null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    setCurrentQuestion(initialQuestion ?? null)
    setSelectedChoice('')
    setFreeformAnswer('')
    setIsLoading(initialQuestion == null)
    setIsSubmitting(false)
    setIsDismissed(false)
    setStatusMessage(null)
    setErrorMessage(null)
    setToast(null)
  }, [goalId, initialQuestion])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null)
    }, 3500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toast])

  useEffect(() => {
    if (!goalId || currentQuestion || isDismissed) {
      return
    }

    let cancelled = false

    async function loadQuestion() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await postJson<NextQuestionApiResponse>(
          `/api/goals/${goalId}/next-question`,
          {},
        )
        if (!cancelled) {
          setCurrentQuestion(payload.nextQuestion)
          setToast(null)
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '次の問いの取得に失敗しました。'
          setErrorMessage(
            message,
          )
          setToast({ tone: 'error', message })
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadQuestion()

    return () => {
      cancelled = true
    }
  }, [currentQuestion, goalId, isDismissed, refreshNonce])

  const normalizedFreeformAnswer = freeformAnswer.trim()
  const answer = normalizedFreeformAnswer || selectedChoice
  const answerKind = normalizedFreeformAnswer ? 'freeform' : 'choice'
  const canSubmit = answer.length > 0 && !isLoading && !isSubmitting

  function handleRefresh() {
    setCurrentQuestion(null)
    setSelectedChoice('')
    setFreeformAnswer('')
    setIsLoading(true)
    setStatusMessage(null)
    setErrorMessage(null)
    setToast(null)
    setIsDismissed(false)
    setRefreshNonce((current) => current + 1)
  }

  async function handleSubmit() {
    if (!currentQuestion || !canSubmit) {
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setStatusMessage(null)
    setToast(null)

    try {
      const payload = await postJson<NextQuestionAnswerApiResponse>(
        `/api/goals/${goalId}/next-question/answer`,
        {
          questionText: currentQuestion.question,
          answer,
          answerKind,
        },
      )

      setCurrentQuestion(payload.nextQuestion)
      setSelectedChoice('')
      setFreeformAnswer('')
      setIsDismissed(false)
      setStatusMessage('回答を保存しました。次の問いに進めます。')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '回答の保存に失敗しました。',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isDismissed) {
    return (
      <>
        <Card
          className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/85"
          data-testid="next-question-card"
        >
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  ASK2ACTION
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  今はこの問いで十分です。必要になったら次の問いをもう一度出せます。
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRefresh}
              >
                もう一度聞く
              </Button>
            </div>
          </CardContent>
        </Card>

        {toast ? (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-lg',
              'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200',
            )}
          >
            {toast.message}
          </div>
        ) : null}
      </>
    )
  }

  return (
    <Card
      className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/85"
      data-testid="next-question-card"
    >
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-700 dark:text-orange-200">
              <Sparkles className="size-4" />
              ASK2ACTION
            </div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              AI からの次の問い
            </h2>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isLoading || isSubmitting}
          >
            <RefreshCcw className={cn('size-3.5', isLoading ? 'animate-spin' : '')} />
            再生成
          </Button>
        </div>

        {isLoading && !currentQuestion ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            <LoaderCircle className="size-4 animate-spin" />
            次の問いを考えています…
          </div>
        ) : null}

        {currentQuestion ? (
          <>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start gap-2.5">
                <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-orange-500" />
                <p className="text-sm leading-6 text-slate-900 dark:text-slate-100">
                  {currentQuestion.question}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {currentQuestion.choices.map((choice) => {
                const isSelected = selectedChoice === choice && normalizedFreeformAnswer.length === 0
                return (
                  <Button
                    key={choice}
                    type="button"
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    className={cn(
                      'justify-start',
                      isSelected ? 'border-orange-500 bg-orange-500 text-white hover:bg-orange-500/90' : '',
                    )}
                    onClick={() => {
                      setSelectedChoice(choice)
                      setFreeformAnswer('')
                      setStatusMessage(null)
                    }}
                    disabled={isSubmitting}
                  >
                    {choice}
                  </Button>
                )
              })}
            </div>

            <div className="mt-4 space-y-2">
              <label
                htmlFor={`next-question-freeform-${goalId}`}
                className="text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                自由回答
              </label>
              <textarea
                id={`next-question-freeform-${goalId}`}
                className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-orange-400 dark:focus:ring-orange-500/20"
                placeholder={currentQuestion.freeform_hint ?? '補足したい事情や迷いを書いてください。'}
                value={freeformAnswer}
                onChange={(event) => {
                  setFreeformAnswer(event.currentTarget.value)
                  if (event.currentTarget.value.trim().length > 0) {
                    setSelectedChoice('')
                  }
                  setStatusMessage(null)
                }}
                disabled={isSubmitting}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin" />
                    保存中…
                  </>
                ) : (
                  '回答して進む'
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIsDismissed(true)}
                disabled={isLoading || isSubmitting}
              >
                もう答えは十分
              </Button>
            </div>
          </>
        ) : null}

        {statusMessage ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{statusMessage}</p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">{errorMessage}</p>
        ) : null}
      </CardContent>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'fixed bottom-4 right-4 z-40 max-w-sm rounded-2xl border px-4 py-3 text-sm shadow-lg',
            toast.tone === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
              : '',
          )}
        >
          {toast.message}
        </div>
      ) : null}
    </Card>
  )
}

export { NextQuestionCard }
export type { NextQuestionCardProps }
