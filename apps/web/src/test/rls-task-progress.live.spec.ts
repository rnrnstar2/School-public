import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRlsLiveContext, shouldRunLiveRls } from './rls-live-helpers'

const describeLive = shouldRunLiveRls() ? describe : describe.skip

describeLive('task_progress RLS (live DB)', () => {
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

  it('allows the owner to read and write task_progress via compiled_plans while blocking other users', async () => {
    const userA = await ctx.asNewUser()
    const userB = await ctx.asNewUser()

    const plan = await ctx.seedRow(
      'compiled_plans',
      {
        user_id: userA.userId,
        goal: 'rls-live: task progress owner plan',
        steps: [],
        unsupported_capabilities: [],
        status: 'active',
      },
      'plan_id',
    )

    await ctx.seedRow(
      'task_progress',
      {
        plan_id: plan.plan_id,
        task_id: 'task-existing',
        status: 'in-progress',
        relevant_lesson_ids: [],
      },
      'id',
    )

    const { data: ownerRows, error: ownerSelectErr } = await userA.client
      .from('task_progress')
      .select('task_id')
      .eq('plan_id', String(plan.plan_id))
    expect(ownerSelectErr).toBeNull()
    expect(ownerRows ?? []).toEqual([{ task_id: 'task-existing' }])

    const { data: otherRows, error: otherSelectErr } = await userB.client
      .from('task_progress')
      .select('task_id')
      .eq('plan_id', String(plan.plan_id))
    expect(otherSelectErr).toBeNull()
    expect(otherRows ?? []).toEqual([])

    const { data: inserted, error: ownerInsertErr } = await userA.client
      .from('task_progress')
      .insert({
        plan_id: String(plan.plan_id),
        task_id: 'task-owner-write',
        status: 'completed',
        relevant_lesson_ids: [],
      })
      .select('id, task_id')
      .single()
    expect(ownerInsertErr).toBeNull()
    expect(inserted?.task_id).toBe('task-owner-write')

    const { error: otherInsertErr } = await userB.client
      .from('task_progress')
      .insert({
        plan_id: String(plan.plan_id),
        task_id: 'task-blocked-write',
        status: 'in-progress',
        relevant_lesson_ids: [],
      })
    expect(otherInsertErr).not.toBeNull()

    if (inserted?.id) {
      await ctx.serviceClient.from('task_progress').delete().eq('id', inserted.id)
    }
  })
})
