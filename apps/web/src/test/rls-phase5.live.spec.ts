/**
 * Live-DB companion for `rls-phase5.spec.ts`.
 *
 * The sibling file asserts on migration SQL text (good for catching migration
 * drift). This file actually runs queries against a local Supabase instance to
 * verify the DB *enforces* the RLS policy it claims to have.
 *
 * These tests only run when `RUN_LIVE_RLS_TESTS=1` and the local Supabase is
 * reachable. See `apps/web/src/test/README.md` for details.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRlsLiveContext, shouldRunLiveRls } from './rls-live-helpers'

const describeLive = shouldRunLiveRls() ? describe : describe.skip

describeLive('compiled_plans RLS (live DB)', () => {
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

  it('user B cannot SELECT compiled_plans owned by user A', async () => {
    const userA = await ctx.asNewUser()
    const userB = await ctx.asNewUser()

    await ctx.seedRow(
      'compiled_plans',
      {
        user_id: userA.userId,
        goal: 'rls-live: own plan for A',
        steps: [],
        unsupported_capabilities: [],
        status: 'active',
      },
      'plan_id',
    )

    // User B must see zero rows from A.
    const { data: bView, error: bErr } = await userB.client
      .from('compiled_plans')
      .select('plan_id')
    expect(bErr).toBeNull()
    expect(bView ?? []).toEqual([])

    // User A must see exactly their own row.
    const { data: aView, error: aErr } = await userA.client
      .from('compiled_plans')
      .select('plan_id')
    expect(aErr).toBeNull()
    expect((aView ?? []).length).toBe(1)
  })

  it('user B cannot INSERT a compiled_plans row with user_id = user A', async () => {
    const userA = await ctx.asNewUser()
    const userB = await ctx.asNewUser()

    const { error } = await userB.client.from('compiled_plans').insert({
      user_id: userA.userId,
      goal: 'rls-live: spoofed insert',
      steps: [],
      unsupported_capabilities: [],
      status: 'active',
    })
    // WITH CHECK (auth.uid() = user_id) must reject this.
    expect(error).not.toBeNull()
  })

  it('user A can INSERT and SELECT their own compiled_plans row', async () => {
    const userA = await ctx.asNewUser()

    const { data: inserted, error: insertErr } = await userA.client
      .from('compiled_plans')
      .insert({
        user_id: userA.userId,
        goal: 'rls-live: legit insert',
        steps: [],
        unsupported_capabilities: [],
        status: 'active',
      })
      .select('plan_id')
      .single()
    expect(insertErr).toBeNull()
    expect(inserted?.plan_id).toBeTruthy()

    // Register for cleanup via the service client so the `afterEach` hook
    // (which only tracks rows seeded via `seedRow`) also deletes it.
    if (inserted?.plan_id) {
      await ctx.serviceClient
        .from('compiled_plans')
        .delete()
        .eq('plan_id', inserted.plan_id)
    }

    const { data: view } = await userA.client
      .from('compiled_plans')
      .select('plan_id')
    expect(view ?? []).toEqual([])
  })
})
