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
    fn: 'decide_lesson_proposal',
    args: {
      p_gate_id: string
      p_decision: string
      p_reason?: string | null
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

describeLive('decision_ledger.decide_lesson_proposal RPC (live DB)', () => {
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
        'id,owner_approval,owner_reviewed_by,owner_review_reason,status,updated_at',
      )
      .eq('id', id)
      .single()

    if (error || !data) {
      throw new Error(`readProposal(${id}): ${error?.message ?? 'row not found'}`)
    }

    return data
  }

  async function seedPendingLessonProposal() {
    const proposal = await seedRow('lesson_dev_proposals', {
      capability_slug: `decide-rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      outcome_slug: 'general',
      priority: 'mid',
      weakest_axis: 'capability',
      rationale: 'live RPC coverage',
      candidate_lesson_slug: 'lesson-decide-rpc',
      gap_ids: [],
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
      proposalId: proposal.id as string,
    }
  }

  it('owner can approve a lesson proposal and updates both gate and proposal atomically', async () => {
    const owner = await ctx.asNewUser({ appMetadata: { role: 'owner' } })
    const seeded = await seedPendingLessonProposal()

    const { data, error } = await decisionLedger(owner.client).rpc(
      'decide_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_decision: 'approved',
        p_reason: 'ship it',
      },
    )

    expect(error).toBeNull()
    expect(data).toMatchObject({
      id: seeded.gateId,
      status: 'approved',
      decided_by: owner.email,
      reason: 'ship it',
    })

    const gate = await readGate(seeded.gateId)
    expect(gate).toMatchObject({
      id: seeded.gateId,
      status: 'approved',
      decided_by: owner.email,
      reason: 'ship it',
    })

    const proposal = await readProposal(seeded.proposalId)
    expect(proposal).toMatchObject({
      id: seeded.proposalId,
      owner_approval: 'approved',
      owner_reviewed_by: owner.email,
      owner_review_reason: 'ship it',
      status: 'approved',
    })
  })

  it('non-owner cannot execute the RPC', async () => {
    const nonOwner = await ctx.asNewUser()
    const seeded = await seedPendingLessonProposal()

    const { data, error } = await decisionLedger(nonOwner.client).rpc(
      'decide_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_decision: 'approved',
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
  })

  it('user_metadata owner claim alone cannot execute the RPC', async () => {
    const metadataOnlyOwner = await ctx.asNewUser({
      userMetadata: { role: 'owner' },
    })
    const seeded = await seedPendingLessonProposal()

    const { data, error } = await decisionLedger(metadataOnlyOwner.client).rpc(
      'decide_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_decision: 'approved',
        p_reason: 'should still fail',
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
  })

  it('rejects invalid decisions before mutating either table', async () => {
    const owner = await ctx.asNewUser({ appMetadata: { role: 'owner' } })
    const seeded = await seedPendingLessonProposal()

    const { data, error } = await decisionLedger(owner.client).rpc(
      'decide_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_decision: 'pending',
        p_reason: 'invalid state',
      },
    )

    expect(data).toBeNull()
    expect(error?.message).toContain('invalid decision: pending')

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
  })

  it('does not allow re-deciding an already decided gate', async () => {
    const owner = await ctx.asNewUser({ appMetadata: { role: 'owner' } })
    const seeded = await seedPendingLessonProposal()

    const firstDecision = await decisionLedger(owner.client).rpc(
      'decide_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_decision: 'approved',
        p_reason: 'first decision sticks',
      },
    )

    expect(firstDecision.error).toBeNull()

    const { data, error } = await decisionLedger(owner.client).rpc(
      'decide_lesson_proposal',
      {
        p_gate_id: seeded.gateId,
        p_decision: 'rejected',
        p_reason: 'should not overwrite',
      },
    )

    expect(data).toBeNull()
    expect(error?.message).toContain('gate not found or not pending')

    const gate = await readGate(seeded.gateId)
    expect(gate).toMatchObject({
      id: seeded.gateId,
      status: 'approved',
      decided_by: owner.email,
      reason: 'first decision sticks',
    })

    const proposal = await readProposal(seeded.proposalId)
    expect(proposal).toMatchObject({
      id: seeded.proposalId,
      owner_approval: 'approved',
      owner_reviewed_by: owner.email,
      owner_review_reason: 'first decision sticks',
      status: 'approved',
    })
  })
})
