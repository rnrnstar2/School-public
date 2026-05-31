import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createRlsLiveContext, shouldRunLiveRls } from './rls-live-helpers'

const describeLive = shouldRunLiveRls() ? describe : describe.skip

type LedgerSingleResult = Promise<{
  data: Record<string, unknown> | null
  error: { message: string } | null
}>

type DecisionLedgerAccess = {
  from: (table: string) => {
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
    }
    insert: (value: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => LedgerSingleResult
      }
    }
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => LedgerSingleResult
      }
    }
  }
  rpc: (
    fn: 'reject_lesson_proposal',
    args: {
      p_gate_id: string
      p_reason: string
    },
  ) => LedgerSingleResult
}

function decisionLedger(client: SupabaseClient): DecisionLedgerAccess {
  return (
    client as unknown as {
      schema: (name: string) => DecisionLedgerAccess
    }
  ).schema('decision_ledger')
}

describeLive('decision_ledger.reject_lesson_proposal RPC (live DB)', () => {
  const ctx = createRlsLiveContext()
  const seededRows: Array<{ table: string; id: string }> = []

  beforeAll(async () => {
    await ctx.setup()
  })
  afterEach(async () => {
    const ledger = decisionLedger(ctx.serviceClient)
    while (seededRows.length > 0) {
      const seed = seededRows.pop()!
      await ledger.from(seed.table).delete().eq('id', seed.id)
    }
    await ctx.cleanup()
  })
  afterAll(async () => {
    await ctx.teardown()
  })

  async function seedRow(
    table: string,
    value: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await decisionLedger(ctx.serviceClient)
      .from(table)
      .insert(value)
      .select('*')
      .single()

    if (error || !data || typeof data.id !== 'string') {
      throw new Error(
        `seedRow(${table}): ${error?.message ?? 'insert returned no id'}`,
      )
    }

    seededRows.push({ table, id: data.id })
    return data
  }

  async function readGate(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await decisionLedger(ctx.serviceClient)
      .from('approval_gates')
      .select('id,status,decided_by,reason')
      .eq('id', id)
      .single()

    if (error || !data) {
      throw new Error(`readGate(${id}): ${error?.message ?? 'row not found'}`)
    }

    return data
  }

  async function readProposal(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await decisionLedger(ctx.serviceClient)
      .from('lesson_dev_proposals')
      .select(
        'id,owner_approval,owner_reviewed_by,owner_review_reason,status',
      )
      .eq('id', id)
      .single()

    if (error || !data) {
      throw new Error(`readProposal(${id}): ${error?.message ?? 'row not found'}`)
    }

    return data
  }

  async function readGap(id: string): Promise<Record<string, unknown>> {
    const { data, error } = await decisionLedger(ctx.serviceClient)
      .from('lesson_gaps')
      .select('id,status')
      .eq('id', id)
      .single()

    if (error || !data) {
      throw new Error(`readGap(${id}): ${error?.message ?? 'row not found'}`)
    }

    return data
  }

  async function seedPendingLessonProposal() {
    const gapA = await seedRow('lesson_gaps', {
      action_id: randomUUID(),
      weakest_axis: 'capability',
      score: 0.22,
      capability_score: 0.22,
      evidence_score: 0.08,
      evidence: { source: 'vitest' },
      top_mappings: [],
      status: 'open',
    })
    const gapB = await seedRow('lesson_gaps', {
      action_id: randomUUID(),
      weakest_axis: 'evidence',
      score: 0.19,
      capability_score: 0.11,
      evidence_score: 0.19,
      evidence: { source: 'vitest' },
      top_mappings: [],
      status: 'open',
    })
    const proposal = await seedRow('lesson_dev_proposals', {
      capability_slug: `reject-rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      outcome_slug: 'general',
      priority: 'mid',
      weakest_axis: 'capability',
      rationale: 'live rejection RPC coverage',
      candidate_lesson_slug: 'lesson-reject-rpc',
      gap_ids: [gapA.id, gapB.id],
      status: 'proposed',
    })
    const gate = await seedRow('approval_gates', {
      gate_type: 'lesson_proposal',
      status: 'pending',
      requested_by: 'vitest',
      metadata: {
        lesson_dev_proposal_id: proposal.id,
        source: 'vitest',
      },
    })

    return {
      gateId: gate.id as string,
      gapIds: [gapA.id as string, gapB.id as string],
      proposalId: proposal.id as string,
    }
  }

  it('owner can reject a lesson proposal and atomically dismiss linked gaps', async () => {
    const owner = await ctx.asNewUser({ appMetadata: { role: 'owner' } })
    const seeded = await seedPendingLessonProposal()

    const { data, error } = await decisionLedger(owner.client).rpc(
      'reject_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_reason: 'out of scope',
      },
    )

    expect(error).toBeNull()
    expect(data).toMatchObject({
      id: seeded.gateId,
      status: 'rejected',
      decided_by: owner.email,
      reason: 'out of scope',
    })

    const gate = await readGate(seeded.gateId)
    expect(gate).toMatchObject({
      id: seeded.gateId,
      status: 'rejected',
      decided_by: owner.email,
      reason: 'out of scope',
    })

    const proposal = await readProposal(seeded.proposalId)
    expect(proposal).toMatchObject({
      id: seeded.proposalId,
      owner_approval: 'rejected',
      owner_reviewed_by: owner.email,
      owner_review_reason: 'out of scope',
      status: 'rejected',
    })

    await Promise.all(
      seeded.gapIds.map(async (gapId) => {
        const gap = await readGap(gapId)
        expect(gap).toMatchObject({
          id: gapId,
          status: 'dismissed',
        })
      }),
    )
  })

  it('non-owner cannot execute the rejection RPC', async () => {
    const nonOwner = await ctx.asNewUser()
    const seeded = await seedPendingLessonProposal()

    const { data, error } = await decisionLedger(nonOwner.client).rpc(
      'reject_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_reason: 'should fail',
      },
    )

    expect(data).toBeNull()
    expect(error?.message).toContain('forbidden: owner role required')

    const gate = await readGate(seeded.gateId)
    expect(gate).toMatchObject({
      id: seeded.gateId,
      status: 'pending',
      decided_by: null,
      reason: null,
    })

    const proposal = await readProposal(seeded.proposalId)
    expect(proposal).toMatchObject({
      id: seeded.proposalId,
      owner_approval: 'pending_owner_review',
      owner_reviewed_by: null,
      owner_review_reason: null,
      status: 'proposed',
    })

    await Promise.all(
      seeded.gapIds.map(async (gapId) => {
        const gap = await readGap(gapId)
        expect(gap).toMatchObject({
          id: gapId,
          status: 'open',
        })
      }),
    )
  })

  it('returns a clear error when the gate is no longer pending', async () => {
    const owner = await ctx.asNewUser({ appMetadata: { role: 'owner' } })
    const seeded = await seedPendingLessonProposal()

    const markDecided = await ctx.serviceClient
      .schema('decision_ledger')
      .from('approval_gates')
      .update({
        status: 'approved',
        decided_by: 'seed',
        decided_at: new Date().toISOString(),
        reason: 'already decided',
      })
      .eq('id', seeded.gateId)

    expect(markDecided.error).toBeNull()

    const { data, error } = await decisionLedger(owner.client).rpc(
      'reject_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_reason: 'too late',
      },
    )

    expect(data).toBeNull()
    expect(error?.message).toContain('gate not found or not pending')

    const gate = await readGate(seeded.gateId)
    expect(gate).toMatchObject({
      id: seeded.gateId,
      status: 'approved',
      decided_by: 'seed',
      reason: 'already decided',
    })

    const proposal = await readProposal(seeded.proposalId)
    expect(proposal).toMatchObject({
      id: seeded.proposalId,
      owner_approval: 'pending_owner_review',
      owner_reviewed_by: null,
      owner_review_reason: null,
      status: 'proposed',
    })

    await Promise.all(
      seeded.gapIds.map(async (gapId) => {
        const gap = await readGap(gapId)
        expect(gap).toMatchObject({
          id: gapId,
          status: 'open',
        })
      }),
    )
  })
})
