import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createRlsLiveContext, shouldRunLiveRls } from './rls-live-helpers'

const describeLive = shouldRunLiveRls() ? describe : describe.skip

type DecisionLedgerAccess = {
  from: (table: string) => {
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
    }
    insert: (value: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: Record<string, unknown> | null
          error: { message: string } | null
        }>
      }
    }
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{
        data: Array<Record<string, unknown>> | null
        error: { message: string } | null
      }>
    }
  }
}

function decisionLedger(client: SupabaseClient): DecisionLedgerAccess {
  return (
    client as unknown as {
      schema: (name: string) => DecisionLedgerAccess
    }
  ).schema('decision_ledger')
}

describeLive('decision_ledger owner inbox RLS (live DB)', () => {
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

  it('owner can SELECT approval_gates, lesson_dev_proposals, lesson_gaps, and the owner view', async () => {
    const owner = await ctx.asNewUser({ appMetadata: { role: 'owner' } })

    const proposal = await seedRow('lesson_dev_proposals', {
      capability_slug: `owner-inbox-${Date.now()}`,
      outcome_slug: 'general',
      priority: 'mid',
      weakest_axis: 'capability',
      rationale: 'live RLS coverage',
      candidate_lesson_slug: 'lesson-owner-inbox',
      gap_ids: [],
      status: 'proposed',
    })
    const gap = await seedRow('lesson_gaps', {
      action_id: randomUUID(),
      weakest_axis: 'capability',
      score: 0.31,
      capability_score: 0.31,
      evidence_score: 0.12,
      evidence: { source: 'vitest' },
      top_mappings: [],
      status: 'open',
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

    const ownerLedger = decisionLedger(owner.client)

    const { data: gates, error: gatesError } = await ownerLedger
      .from('approval_gates')
      .select('id')
      .eq('id', gate.id as string)
    expect(gatesError).toBeNull()
    expect(gates ?? []).toEqual([{ id: gate.id }])

    const { data: proposals, error: proposalsError } = await ownerLedger
      .from('lesson_dev_proposals')
      .select('id')
      .eq('id', proposal.id as string)
    expect(proposalsError).toBeNull()
    expect(proposals ?? []).toEqual([{ id: proposal.id }])

    const { data: gaps, error: gapsError } = await ownerLedger
      .from('lesson_gaps')
      .select('id')
      .eq('id', gap.id as string)
    expect(gapsError).toBeNull()
    expect(gaps ?? []).toEqual([{ id: gap.id }])

    const { data: inboxRows, error: inboxError } = await ownerLedger
      .from('v_owner_pending_lesson_proposals')
      .select('gate_id,proposal_id')
      .eq('gate_id', gate.id as string)
    expect(inboxError).toBeNull()
    expect(inboxRows ?? []).toEqual([
      {
        gate_id: gate.id,
        proposal_id: proposal.id,
      },
    ])
  })

  it('non-owner cannot SELECT owner inbox tables or view', async () => {
    const nonOwner = await ctx.asNewUser()

    const proposal = await seedRow('lesson_dev_proposals', {
      capability_slug: `owner-inbox-${Date.now()}-non-owner`,
      outcome_slug: 'general',
      priority: 'mid',
      weakest_axis: 'evidence',
      rationale: 'negative RLS coverage',
      candidate_lesson_slug: 'lesson-non-owner',
      gap_ids: [],
      status: 'proposed',
    })
    const gap = await seedRow('lesson_gaps', {
      action_id: randomUUID(),
      weakest_axis: 'evidence',
      score: 0.22,
      evidence_score: 0.22,
      evidence: { source: 'vitest' },
      top_mappings: [],
      status: 'open',
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

    const nonOwnerLedger = decisionLedger(nonOwner.client)

    const { data: gates, error: gatesError } = await nonOwnerLedger
      .from('approval_gates')
      .select('id')
      .eq('id', gate.id as string)
    expect(gatesError).toBeNull()
    expect(gates ?? []).toEqual([])

    const { data: proposals, error: proposalsError } = await nonOwnerLedger
      .from('lesson_dev_proposals')
      .select('id')
      .eq('id', proposal.id as string)
    expect(proposalsError).toBeNull()
    expect(proposals ?? []).toEqual([])

    const { data: gaps, error: gapsError } = await nonOwnerLedger
      .from('lesson_gaps')
      .select('id')
      .eq('id', gap.id as string)
    expect(gapsError).toBeNull()
    expect(gaps ?? []).toEqual([])

    const { data: inboxRows, error: inboxError } = await nonOwnerLedger
      .from('v_owner_pending_lesson_proposals')
      .select('gate_id')
      .eq('gate_id', gate.id as string)
    expect(inboxError).toBeNull()
    expect(inboxRows ?? []).toEqual([])
  })

  it('user_metadata owner claim alone cannot SELECT owner inbox tables or view', async () => {
    const metadataOnlyOwner = await ctx.asNewUser({
      userMetadata: { role: 'owner' },
    })

    const proposal = await seedRow('lesson_dev_proposals', {
      capability_slug: `owner-inbox-${Date.now()}-metadata-only`,
      outcome_slug: 'general',
      priority: 'mid',
      weakest_axis: 'capability',
      rationale: 'user_metadata must not unlock owner RLS',
      candidate_lesson_slug: 'lesson-metadata-only-owner',
      gap_ids: [],
      status: 'proposed',
    })
    const gap = await seedRow('lesson_gaps', {
      action_id: randomUUID(),
      weakest_axis: 'capability',
      score: 0.41,
      capability_score: 0.41,
      evidence_score: 0.19,
      evidence: { source: 'vitest' },
      top_mappings: [],
      status: 'open',
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

    const metadataOnlyOwnerLedger = decisionLedger(metadataOnlyOwner.client)

    const { data: gates, error: gatesError } = await metadataOnlyOwnerLedger
      .from('approval_gates')
      .select('id')
      .eq('id', gate.id as string)
    expect(gatesError).toBeNull()
    expect(gates ?? []).toEqual([])

    const { data: proposals, error: proposalsError } = await metadataOnlyOwnerLedger
      .from('lesson_dev_proposals')
      .select('id')
      .eq('id', proposal.id as string)
    expect(proposalsError).toBeNull()
    expect(proposals ?? []).toEqual([])

    const { data: gaps, error: gapsError } = await metadataOnlyOwnerLedger
      .from('lesson_gaps')
      .select('id')
      .eq('id', gap.id as string)
    expect(gapsError).toBeNull()
    expect(gaps ?? []).toEqual([])

    const { data: inboxRows, error: inboxError } = await metadataOnlyOwnerLedger
      .from('v_owner_pending_lesson_proposals')
      .select('gate_id')
      .eq('gate_id', gate.id as string)
    expect(inboxError).toBeNull()
    expect(inboxRows ?? []).toEqual([])
  })
})
