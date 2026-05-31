'use server'

import { revalidatePath } from 'next/cache'

import { requireAdminRouteUser } from '@/app/api/admin/atom-versions/_server'
import {
  createDefaultSchedulerPrWorker,
  createSupabaseSchedulerAdminRepository,
  reviewSchedulerDecision,
} from '@/lib/scheduler/admin'
import type {
  ReviewSchedulerDecisionInput,
  ReviewSchedulerDecisionResult,
} from '@/lib/scheduler/types'

export async function reviewSchedulerDecisionAction(
  input: ReviewSchedulerDecisionInput,
): Promise<ReviewSchedulerDecisionResult> {
  const reviewer = await requireAdminRouteUser()
  const repository = createSupabaseSchedulerAdminRepository()
  const result = await reviewSchedulerDecision({
    repository,
    reviewer,
    input,
    prWorker: createDefaultSchedulerPrWorker(),
  })

  if (result.ok) {
    revalidatePath('/admin/scheduler')
  }

  return result
}
