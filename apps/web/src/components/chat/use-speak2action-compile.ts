'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  goalTreeApiResponseSchema,
  type GoalTreeGoal,
  type GoalTreeNode,
} from '@/types/goal-tree'
import type { MentorChatStructuredOutput } from '@/types/mentor-chat'

export type Speak2ActionSourceKind = 'mentor_chat' | 'lesson_chat' | 'hearing'

export interface Speak2ActionToastState {
  tone: 'success' | 'warning' | 'error'
  message: string
}

interface UseSpeak2ActionCompileOptions {
  sourceKind: Speak2ActionSourceKind
  lessonId?: string
  goalId?: string | null
  nodeId?: string | null
}

function getCurrentPath() {
  if (typeof window === 'undefined') {
    return '/'
  }

  return `${window.location.pathname}${window.location.search}`
}

function hasStructuredUpdates(structuredOutput: MentorChatStructuredOutput | null | undefined) {
  if (!structuredOutput) {
    return false
  }

  return (
    structuredOutput.decisions.some((item) => item.trim().length > 0)
    || structuredOutput.open_questions.some((item) => item.trim().length > 0)
    || Boolean(structuredOutput.next_action?.trim())
  )
}

function buildStructuredOutputKey(structuredOutput: MentorChatStructuredOutput) {
  return JSON.stringify({
    reply: structuredOutput.reply.trim(),
    decisions: structuredOutput.decisions.map((item) => item.trim()).filter(Boolean),
    openQuestions: structuredOutput.open_questions.map((item) => item.trim()).filter(Boolean),
    nextQuestion: structuredOutput.next_question?.trim() ?? '',
    nextAction: structuredOutput.next_action?.trim() ?? '',
  })
}

function chooseNonLessonGoal(goals: GoalTreeGoal[], explicitGoalId: string | null | undefined) {
  if (explicitGoalId) {
    return goals.find((goal) => goal.id === explicitGoalId) ?? null
  }

  const pathnameMatch = getCurrentPath().match(/^\/goals\/([0-9a-f-]{36})(?:[/?#]|$)/i)
  if (pathnameMatch) {
    const matched = goals.find((goal) => goal.id === pathnameMatch[1])
    if (matched) {
      return matched
    }
  }

  return goals.find((goal) => goal.status === 'active') ?? goals[0] ?? null
}

function chooseNonLessonNode(params: {
  goal: GoalTreeGoal
  sourceKind: Speak2ActionSourceKind
  lessonId?: string
  explicitNodeId?: string | null
}) {
  if (params.explicitNodeId) {
    return params.goal.nodes.find((node) => node.id === params.explicitNodeId) ?? null
  }

  if (params.lessonId) {
    const lessonNode = params.goal.nodes.find(
      (node) => node.selected_lesson?.lesson_id === params.lessonId,
    )
    if (lessonNode) {
      return lessonNode
    }
  }

  if (params.sourceKind === 'hearing') {
    return params.goal.nodes.find((node) => node.node_type === 'objective')
      ?? params.goal.nodes[0]
      ?? null
  }

  return params.goal.nodes.find((node) => node.status === 'in_progress' && node.node_type === 'task')
    ?? params.goal.nodes.find((node) => node.status === 'pending' && node.node_type === 'task')
    ?? params.goal.nodes.find((node) => node.status === 'in_progress')
    ?? params.goal.nodes[0]
    ?? null
}

function resolveLessonChatTarget(params: {
  goals: GoalTreeGoal[]
  lessonId?: string
  explicitGoalId?: string | null
  explicitNodeId?: string | null
}) {
  if (!params.lessonId) {
    return null
  }

  const candidates = params.goals.flatMap((goal) => (
    goal.nodes
      .filter((node) => node.selected_lesson?.lesson_id === params.lessonId)
      .map((node) => ({ goal, node }))
  ))

  if (params.explicitGoalId && params.explicitNodeId) {
    const exactMatch = candidates.find(
      ({ goal, node }) => goal.id === params.explicitGoalId && node.id === params.explicitNodeId,
    )
    if (exactMatch) {
      return exactMatch
    }
  }

  if (params.explicitGoalId) {
    const goalMatches = candidates.filter(({ goal }) => goal.id === params.explicitGoalId)
    if (goalMatches.length === 1) {
      return goalMatches[0]
    }
    if (goalMatches.length > 1) {
      return null
    }
  }

  if (params.explicitNodeId) {
    const nodeMatches = candidates.filter(({ node }) => node.id === params.explicitNodeId)
    if (nodeMatches.length === 1) {
      return nodeMatches[0]
    }
    if (nodeMatches.length > 1) {
      return null
    }
  }

  return candidates.length === 1 ? candidates[0] : null
}

function buildSourceValue(sourceKind: Speak2ActionSourceKind, lessonId: string | undefined) {
  if (sourceKind === 'lesson_chat' && lessonId) {
    return `lesson_chat:/lessons/${lessonId}`
  }

  return `${sourceKind}:${getCurrentPath()}`
}

const LESSON_CHAT_TARGET_NOT_FOUND_MESSAGE = '関連する goal が見つかりませんでした。'

async function loadGoalTree() {
  const response = await fetch('/api/goals/me', {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    return null
  }

  const payload = goalTreeApiResponseSchema.safeParse(await response.json())
  return payload.success ? payload.data : null
}

function buildToastMessage(updatedCount: number, failedCount: number) {
  if (updatedCount <= 0 && failedCount <= 0) {
    return null
  }

  if (updatedCount > 0 && failedCount > 0) {
    return `会話から plan を ${updatedCount} 件更新しました。${failedCount} 件は反映できませんでした。`
  }

  if (updatedCount > 0) {
    return `会話から plan を ${updatedCount} 件更新しました。`
  }

  return `会話から plan へ反映できませんでした。${failedCount} 件失敗しました。`
}

export function useSpeak2ActionCompile(options: UseSpeak2ActionCompileOptions) {
  const roundRef = useRef(0)
  const inFlightAttemptRef = useRef<{ round: number; key: string } | null>(null)
  const completedAttemptRef = useRef<{ round: number; key: string } | null>(null)
  const [toast, setToast] = useState<Speak2ActionToastState | null>(null)

  useEffect(() => {
    if (!toast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null)
    }, 4000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [toast])

  const resetRound = useCallback(() => {
    roundRef.current += 1
    inFlightAttemptRef.current = null
    completedAttemptRef.current = null
  }, [])

  const compileStructuredOutput = useCallback(async (
    structuredOutput: MentorChatStructuredOutput | null | undefined,
  ) => {
    if (!structuredOutput || !hasStructuredUpdates(structuredOutput)) {
      return null
    }

    const attempt = {
      round: roundRef.current,
      key: JSON.stringify({
        sourceKind: options.sourceKind,
        lessonId: options.lessonId ?? null,
        goalId: options.goalId ?? null,
        nodeId: options.nodeId ?? null,
        structuredOutput: buildStructuredOutputKey(structuredOutput),
      }),
    }

    const isCurrentAttempt = (value: { round: number; key: string } | null) =>
      value?.round === attempt.round && value.key === attempt.key

    if (isCurrentAttempt(inFlightAttemptRef.current) || isCurrentAttempt(completedAttemptRef.current)) {
      return null
    }

    inFlightAttemptRef.current = attempt

    try {
      const goalTree = await loadGoalTree()
      if (!goalTree) {
        return null
      }

      let targetGoal: GoalTreeGoal | null = null
      let targetNode: GoalTreeNode | null = null

      if (options.sourceKind === 'lesson_chat') {
        const resolvedTarget = resolveLessonChatTarget({
          goals: goalTree.goals,
          lessonId: options.lessonId,
          explicitGoalId: options.goalId,
          explicitNodeId: options.nodeId,
        })

        if (!resolvedTarget) {
          completedAttemptRef.current = attempt
          setToast({
            tone: 'warning',
            message: LESSON_CHAT_TARGET_NOT_FOUND_MESSAGE,
          })
          return null
        }

        targetGoal = resolvedTarget.goal
        targetNode = resolvedTarget.node
      } else {
        targetGoal = chooseNonLessonGoal(goalTree.goals, options.goalId)
        if (!targetGoal) {
          return null
        }

        targetNode = chooseNonLessonNode({
          goal: targetGoal,
          sourceKind: options.sourceKind,
          lessonId: options.lessonId,
          explicitNodeId: options.nodeId,
        })
      }

      const response = await fetch(`/api/goals/${targetGoal.id}/chat/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          structuredOutput,
          chatContext: {
            ...(targetNode ? { nodeId: targetNode.id } : {}),
            source: buildSourceValue(options.sourceKind, options.lessonId),
          },
        }),
      })

      const payload = await response.json().catch(() => null) as
        | {
            ok?: boolean
            inserted?: {
              decisions?: number
              openQuestions?: number
              taskNodeId?: string
            }
            error?: string[]
          }
        | null

      if (!response.ok || !payload) {
        throw new Error(`compile:${response.status}`)
      }

      completedAttemptRef.current = attempt

      const updatedCount =
        (payload.inserted?.decisions ?? 0)
        + (payload.inserted?.openQuestions ?? 0)
        + (payload.inserted?.taskNodeId ? 1 : 0)
      const failedCount = Array.isArray(payload.error) ? payload.error.length : 0
      const message = buildToastMessage(updatedCount, failedCount)

      if (message) {
        setToast({
          tone: updatedCount > 0 ? 'success' : 'error',
          message,
        })
      }

      if (updatedCount > 0) {
        window.dispatchEvent(new CustomEvent('goal-context-updated', {
          detail: {
            goalId: targetGoal.id,
          },
        }))
      }

      return payload
    } catch (error) {
      console.error('Speak2Action compile failed', error)
      setToast({
        tone: 'error',
        message: '会話から plan への反映に失敗しました。',
      })
      return null
    } finally {
      if (isCurrentAttempt(inFlightAttemptRef.current)) {
        inFlightAttemptRef.current = null
      }
    }
  }, [options.goalId, options.lessonId, options.nodeId, options.sourceKind])

  return {
    toast,
    setToast,
    resetRound,
    compileStructuredOutput,
  }
}
