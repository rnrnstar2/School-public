import { NextResponse } from 'next/server'

import { runImprovementLoop } from '@/lib/improvement/loop'
import { createImprovementRepository } from '@/lib/improvement/repository'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runImprovementLoop({
      repository: createImprovementRepository(),
      now: new Date(),
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Improvement loop failed'
    console.error('[improvement-loop]', error)
    return NextResponse.json(
      {
        error: 'Improvement loop failed',
        detail: message,
      },
      { status: 500 },
    )
  }
}
