/**
 * Live-DB behavioral test for the `goals` table RLS policies.
 *
 * Migration: apps/web/supabase/migrations/027_goal_first_canonical_tables.sql
 * Policies covered:
 *   - goals_owner_select  (FOR SELECT USING auth.uid() = user_id)
 *   - goals_owner_insert  (FOR INSERT WITH CHECK auth.uid() = user_id)
 *   - goals_owner_update  (FOR UPDATE USING/WITH CHECK auth.uid() = user_id)
 *   - goals_owner_delete  (FOR DELETE USING auth.uid() = user_id)
 *
 * Opt in with `RUN_LIVE_RLS_TESTS=1` against a local Supabase (see README).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRlsLiveContext, shouldRunLiveRls } from './rls-live-helpers'

const describeLive = shouldRunLiveRls() ? describe : describe.skip

describeLive('goals RLS (live DB)', () => {
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

  it('user B cannot SELECT goals owned by user A', async () => {
    const userA = await ctx.asNewUser()
    const userB = await ctx.asNewUser()

    await ctx.seedRow('goals', {
      user_id: userA.userId,
      outcome: 'rls-live: a goal for A',
      status: 'active',
    })

    const { data: bView, error: bErr } = await userB.client
      .from('goals')
      .select('id')
    expect(bErr).toBeNull()
    expect(bView ?? []).toEqual([])

    const { data: aView, error: aErr } = await userA.client
      .from('goals')
      .select('id')
    expect(aErr).toBeNull()
    expect((aView ?? []).length).toBe(1)
  })

  it('user B cannot UPDATE a goal owned by user A', async () => {
    const userA = await ctx.asNewUser()
    const userB = await ctx.asNewUser()

    const seedRaw = await ctx.seedRow('goals', {
      user_id: userA.userId,
      outcome: 'rls-live: original outcome',
      status: 'active',
    })
    const seed = { id: seedRaw.id as string }

    // UPDATE as B — RLS should filter the row out, so 0 rows are updated.
    // PostgREST returns no error, but the result data is empty.
    const { data: updated, error } = await userB.client
      .from('goals')
      .update({ outcome: 'rls-live: hijacked by B' })
      .eq('id', seed.id)
      .select('id, outcome')
    expect(error).toBeNull()
    expect(updated ?? []).toEqual([])

    // Verify the row was NOT actually modified (check via service client).
    const { data: check } = await ctx.serviceClient
      .from('goals')
      .select('outcome')
      .eq('id', seed.id)
      .single()
    expect(check?.outcome).toBe('rls-live: original outcome')
  })

  it('user B cannot DELETE a goal owned by user A', async () => {
    const userA = await ctx.asNewUser()
    const userB = await ctx.asNewUser()

    const seedRaw = await ctx.seedRow('goals', {
      user_id: userA.userId,
      outcome: 'rls-live: delete target',
      status: 'active',
    })
    const seed = { id: seedRaw.id as string }

    const { error } = await userB.client
      .from('goals')
      .delete()
      .eq('id', seed.id)
    expect(error).toBeNull()

    // Row should still exist when read via the service client.
    const { data: check } = await ctx.serviceClient
      .from('goals')
      .select('id')
      .eq('id', seed.id)
      .single()
    expect(check?.id).toBe(seed.id)
  })

  it('user A can SELECT, UPDATE, and DELETE their own goal', async () => {
    const userA = await ctx.asNewUser()

    const { data: inserted, error: insertErr } = await userA.client
      .from('goals')
      .insert({
        user_id: userA.userId,
        outcome: 'rls-live: my own goal',
        status: 'active',
      })
      .select('id')
      .single()
    expect(insertErr).toBeNull()
    expect(inserted?.id).toBeTruthy()

    const goalId = inserted!.id

    const { data: updated, error: updateErr } = await userA.client
      .from('goals')
      .update({ outcome: 'rls-live: updated by owner' })
      .eq('id', goalId)
      .select('outcome')
      .single()
    expect(updateErr).toBeNull()
    expect(updated?.outcome).toBe('rls-live: updated by owner')

    const { error: deleteErr } = await userA.client
      .from('goals')
      .delete()
      .eq('id', goalId)
    expect(deleteErr).toBeNull()
  })
})
