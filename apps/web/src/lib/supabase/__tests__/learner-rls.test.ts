import { randomUUID } from 'node:crypto'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { type SupabaseClient } from '@supabase/supabase-js'

import {
  createRlsLiveContext,
  shouldRunLiveRls,
} from '@/test/rls-live-helpers'

const describeLive = shouldRunLiveRls() ? describe : describe.skip

type IdRow = { id: string }
type LedgerListResult<TRow extends Record<string, unknown>> = Promise<{
  data: TRow[] | null
  error: { message: string } | null
}>
type LedgerSingleResult<TRow extends Record<string, unknown>> = Promise<{
  data: TRow | null
  error: { message: string } | null
}>
type LedgerTableClient<TRow extends Record<string, unknown> = Record<string, unknown>> = {
  insert: (value: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => LedgerSingleResult<TRow>
    }
  }
  select: (columns: string) => {
    in: (column: string, values: string[]) => LedgerListResult<TRow>
  }
}
type LedgerSchemaClient = {
  from: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
  ) => LedgerTableClient<TRow>
}

function ledger(client: SupabaseClient): LedgerSchemaClient {
  return (
    client as unknown as {
      schema: (name: string) => LedgerSchemaClient
    }
  ).schema('decision_ledger')
}

async function insertLedgerRow(
  client: LedgerSchemaClient,
  table: string,
  value: Record<string, unknown>,
): Promise<IdRow> {
  const { data, error } = await client
    .from<IdRow>(table)
    .insert(value)
    .select('id')
    .single()

  expect(error).toBeNull()
  expect(data?.id).toBeTruthy()

  return data as IdRow
}

async function visibleIds(
  client: SupabaseClient,
  table: string,
  ids: string[],
): Promise<string[]> {
  const { data, error } = await ledger(client)
    .from<IdRow>(table)
    .select('id')
    .in('id', ids)

  expect(error).toBeNull()

  return (data ?? []).map((row) => row.id).sort()
}

describeLive('decision_ledger learner SELECT policies (live DB)', () => {
  const ctx = createRlsLiveContext()

  beforeAll(async () => {
    await ctx.setup()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  afterAll(async () => {
    await ctx.teardown()
  })

  it('only exposes the authenticated learner own goal tree rows', async () => {
    const serviceLedger = ledger(ctx.serviceClient)
    const userA = await ctx.asNewUser()
    const userB = await ctx.asNewUser()
    const suffix = randomUUID().slice(0, 8)

    const goalA = await insertLedgerRow(serviceLedger, 'goals', {
      user_id: userA.userId,
      title: `learner-a-${suffix}`,
      status: 'active',
    })
    const goalB = await insertLedgerRow(serviceLedger, 'goals', {
      user_id: userB.userId,
      title: `learner-b-${suffix}`,
      status: 'active',
    })

    const nodeA = await insertLedgerRow(serviceLedger, 'goal_nodes', {
      goal_id: goalA.id,
      label: `node-a-${suffix}`,
      node_type: 'task',
      status: 'pending',
    })
    const nodeB = await insertLedgerRow(serviceLedger, 'goal_nodes', {
      goal_id: goalB.id,
      label: `node-b-${suffix}`,
      node_type: 'task',
      status: 'pending',
    })

    const contextA = await insertLedgerRow(serviceLedger, 'goal_contexts', {
      goal_id: goalA.id,
      node_id: nodeA.id,
      source_type: 'other',
      content: `context-a-${suffix}`,
    })
    const contextB = await insertLedgerRow(serviceLedger, 'goal_contexts', {
      goal_id: goalB.id,
      node_id: nodeB.id,
      source_type: 'other',
      content: `context-b-${suffix}`,
    })

    const matchA = await insertLedgerRow(
      serviceLedger,
      'goal_node_lesson_matches',
      {
        goal_node_id: nodeA.id,
        lesson_id: `lesson-a-${suffix}`,
        score: 0.91,
        selected: true,
      },
    )
    const matchB = await insertLedgerRow(
      serviceLedger,
      'goal_node_lesson_matches',
      {
        goal_node_id: nodeB.id,
        lesson_id: `lesson-b-${suffix}`,
        score: 0.87,
        selected: false,
      },
    )

    await expect(
      visibleIds(userA.client, 'goals', [goalA.id, goalB.id]),
    ).resolves.toEqual([goalA.id])
    await expect(
      visibleIds(userB.client, 'goals', [goalA.id, goalB.id]),
    ).resolves.toEqual([goalB.id])

    await expect(
      visibleIds(userA.client, 'goal_nodes', [nodeA.id, nodeB.id]),
    ).resolves.toEqual([nodeA.id])
    await expect(
      visibleIds(userB.client, 'goal_nodes', [nodeA.id, nodeB.id]),
    ).resolves.toEqual([nodeB.id])

    await expect(
      visibleIds(userA.client, 'goal_contexts', [contextA.id, contextB.id]),
    ).resolves.toEqual([contextA.id])
    await expect(
      visibleIds(userB.client, 'goal_contexts', [contextA.id, contextB.id]),
    ).resolves.toEqual([contextB.id])

    await expect(
      visibleIds(userA.client, 'goal_node_lesson_matches', [matchA.id, matchB.id]),
    ).resolves.toEqual([matchA.id])
    await expect(
      visibleIds(userB.client, 'goal_node_lesson_matches', [matchA.id, matchB.id]),
    ).resolves.toEqual([matchB.id])
  })
})
