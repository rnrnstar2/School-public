import { z } from 'zod/v4'

import { requireOwnerRouteUser } from '@/app/api/admin/atom-versions/_server'
import { jsonResponse } from '@/lib/api/response'
import { runApprovedLessonProposalBridges } from '@/lib/goal-action/bridge-runner'
import {
  runGapLoop,
  runGapScanJob,
  runProposerJob,
} from '@/lib/goal-action/gap-loop'
import { runGoalActionJudgeJob } from '@/lib/goal-action/judge-runner'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  job: z
    .enum(['all', 'gap_scan', 'proposer_run', 'bridge_run', 'judge_run'])
    .default('all'),
})

async function authorize(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true as const, actor: 'cron' }
  }

  const owner = await requireOwnerRouteUser()
  if (owner) {
    return { ok: true as const, actor: owner.email ?? owner.id }
  }

  return { ok: false as const }
}

async function parseBody(request: Request) {
  const raw = await request.text()
  if (!raw.trim()) {
    return { job: 'all' as const }
  }

  return bodySchema.parse(JSON.parse(raw) as unknown)
}

export async function POST(request: Request) {
  const authorization = await authorize(request)
  if (!authorization.ok) {
    return jsonResponse(
      {
        error: 'forbidden',
        message: 'Owner 権限または cron secret が必要です。',
      },
      { status: 403 },
      request,
    )
  }

  try {
    const body = await parseBody(request)
    const data =
      body.job === 'gap_scan'
        ? { gapScan: await runGapScanJob() }
        : body.job === 'bridge_run'
          ? { bridgeRun: await runApprovedLessonProposalBridges() }
          : body.job === 'judge_run'
            ? { judgeRun: await runGoalActionJudgeJob() }
        : body.job === 'proposer_run'
          ? { proposerRun: await runProposerJob() }
          : {
              ...(await runGapLoop()),
              bridgeRun: await runApprovedLessonProposalBridges(),
            }

    return jsonResponse(
      {
        data: {
          actor: authorization.actor,
          job: body.job,
          ...data,
        },
      },
      undefined,
      request,
    )
  } catch (error) {
    console.error('[api/scheduler/run]', error)
    return jsonResponse(
      {
        error: 'scheduler_run_failed',
        message: 'scheduler job の実行に失敗しました。',
        detail: error instanceof Error ? error.message : 'Unknown scheduler failure',
      },
      { status: 500 },
      request,
    )
  }
}
