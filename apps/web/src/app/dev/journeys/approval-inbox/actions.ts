'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'

import { requireOwnerRouteUser } from '@/app/api/admin/atom-versions/_server'
import { runLessonProposalBridge } from '@/lib/goal-action/bridge-runner'
import { createClient } from '@/lib/supabase/server'

const reviewSchema = z.object({
  gateId: z.string().uuid(),
  proposalId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
})

export type ReviewLessonProposalGateInput = z.infer<typeof reviewSchema>

export type ReviewLessonProposalGateResult = {
  ok: boolean
  message: string
}

const gateMetadataSchema = z.object({
  lesson_dev_proposal_id: z.string().uuid(),
})

function mapDecisionRpcErrorMessage(errorMessage: string) {
  if (errorMessage.includes('forbidden: owner role required')) {
    return 'owner 権限が必要です。'
  }

  if (errorMessage.includes('invalid decision')) {
    return '承認状態が不正です。画面を更新して再試行してください。'
  }

  if (errorMessage.includes('gate not found or not pending')) {
    return 'この gate は見つからないか、すでに処理済みです。画面を更新してください。'
  }

  if (errorMessage.includes('linked lesson proposal not found or not pending')) {
    return '対応する proposal が見つからないか、すでに処理済みです。'
  }

  if (errorMessage.includes('linked lesson proposal not found')) {
    return '対応する proposal が見つかりません。'
  }

  if (errorMessage.includes('linked lesson gaps not found')) {
    return '関連 gap の状態が不整合です。画面を更新して再試行してください。'
  }

  return errorMessage
}

function extractProposalIdFromGateMetadata(metadata: unknown): string | null {
  const parsed = gateMetadataSchema.safeParse(metadata)
  return parsed.success ? parsed.data.lesson_dev_proposal_id : null
}

async function resolveProposalIdForGate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gateId: string,
  rpcGateData: { metadata?: unknown } | null,
): Promise<{ proposalId: string | null; error: string | null }> {
  const proposalId = extractProposalIdFromGateMetadata(rpcGateData?.metadata)
  if (proposalId) {
    return { proposalId, error: null }
  }

  const { data, error } = await supabase
    .schema('decision_ledger')
    .from('approval_gates')
    .select('metadata')
    .eq('id', gateId)
    .single()

  if (error) {
    return {
      proposalId: null,
      error: error.message,
    }
  }

  const resolvedProposalId = extractProposalIdFromGateMetadata(data?.metadata)
  if (!resolvedProposalId) {
    return {
      proposalId: null,
      error: 'decision_ledger.approval_gates.metadata.lesson_dev_proposal_id is missing',
    }
  }

  return {
    proposalId: resolvedProposalId,
    error: null,
  }
}

export async function reviewLessonProposalGateAction(
  rawInput: ReviewLessonProposalGateInput,
): Promise<ReviewLessonProposalGateResult> {
  const owner = await requireOwnerRouteUser()
  if (!owner) {
    return {
      ok: false,
      message: 'owner 権限が必要です。',
    }
  }

  const parsed = reviewSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      message: '入力が不正です。',
    }
  }

  const input = parsed.data
  const reason = input.reason?.trim() || null
  if (input.decision === 'rejected' && !reason) {
    return {
      ok: false,
      message: '却下する場合は理由を入力してください。',
    }
  }

  const supabase = await createClient()
  const ledger = supabase.schema('decision_ledger')
  const { data, error } =
    input.decision === 'approved'
      ? await ledger.rpc(
          'decide_lesson_proposal',
          reason
            ? {
                p_gate_id: input.gateId,
                p_decision: 'approved',
                p_reason: reason,
              }
            : {
                p_gate_id: input.gateId,
                p_decision: 'approved',
              },
        )
      : await ledger.rpc('reject_lesson_proposal', {
          p_gate_id: input.gateId,
          p_reason: reason!,
        })

  if (error) {
    return {
      ok: false,
      message: mapDecisionRpcErrorMessage(error.message),
    }
  }

  if (input.decision === 'rejected') {
    revalidatePath('/dev/journeys')
    revalidatePath('/dev/journeys/approval-inbox')

    return {
      ok: true,
      message: '却下しました。',
    }
  }

  const resolvedProposal = await resolveProposalIdForGate(
    supabase,
    input.gateId,
    data as { metadata?: unknown } | null,
  )

  let bridgeMessage: string | null = null
  if (resolvedProposal.error || !resolvedProposal.proposalId) {
    bridgeMessage = `承認しましたが bridge 実行前の proposal 解決に失敗しました: ${resolvedProposal.error ?? 'proposal not found'}`
  } else {
    const bridgeResult = await runLessonProposalBridge(resolvedProposal.proposalId)
    if (bridgeResult.status === 'failed') {
      bridgeMessage = `承認しましたが bridge 実行に失敗しました: ${bridgeResult.error ?? 'Unknown bridge failure'}`
    } else if (bridgeResult.status === 'disabled') {
      bridgeMessage = '承認しました。bridge は feature flag により停止中です。'
    } else if (bridgeResult.status === 'success') {
      bridgeMessage = '承認しました。lesson-factory bridge を eval まで進めました。'
    }
  }

  revalidatePath('/dev/journeys')
  revalidatePath('/dev/journeys/approval-inbox')

  return {
    ok: true,
    message: bridgeMessage ?? '承認しました。',
  }
}
