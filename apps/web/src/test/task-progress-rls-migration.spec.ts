import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const MIGRATION_PATH = resolve(
  __dirname,
  '../../supabase/migrations/20260418120000_drop_legacy_plans_and_friends.sql',
)

const migrationSql = readFileSync(MIGRATION_PATH, 'utf-8')

describe('Legacy plans drop migration — task_progress RLS', () => {
  it('recreates task_progress policies against compiled_plans after dropping plans', () => {
    expect(migrationSql).toContain('DROP TABLE IF EXISTS public.plans CASCADE;')
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "task_progress_select" ON public.task_progress;')
    expect(migrationSql).toContain('CREATE POLICY "task_progress_select"')
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "task_progress_insert" ON public.task_progress;')
    expect(migrationSql).toContain('CREATE POLICY "task_progress_insert"')
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "task_progress_update" ON public.task_progress;')
    expect(migrationSql).toContain('CREATE POLICY "task_progress_update"')
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "task_progress_delete" ON public.task_progress;')
    expect(migrationSql).toContain('CREATE POLICY "task_progress_delete"')
    expect(migrationSql).toContain('FROM public.compiled_plans')
    expect(migrationSql).toContain('WHERE compiled_plans.plan_id = task_progress.plan_id')
    expect(migrationSql).toContain('AND compiled_plans.user_id = auth.uid()')
  })

  it('deletes legacy orphan progress rows before adding compiled_plans foreign keys', () => {
    const taskDelete = `DELETE FROM public.task_progress
WHERE plan_id IS NOT NULL
  AND plan_id NOT IN (SELECT plan_id FROM public.compiled_plans);`
    const milestoneDelete = `DELETE FROM public.milestone_progress
WHERE plan_id IS NOT NULL
  AND plan_id NOT IN (SELECT plan_id FROM public.compiled_plans);`

    expect(migrationSql).toContain(taskDelete)
    expect(migrationSql).toContain(milestoneDelete)
    expect(migrationSql.indexOf(taskDelete)).toBeLessThan(
      migrationSql.indexOf('ADD CONSTRAINT task_progress_plan_id_fkey')
    )
    expect(migrationSql.indexOf(milestoneDelete)).toBeLessThan(
      migrationSql.indexOf('ADD CONSTRAINT milestone_progress_plan_id_fkey')
    )
  })

  it('recreates plan_id foreign keys against compiled_plans after dropping plans', () => {
    expect(migrationSql).toContain('ADD CONSTRAINT task_progress_plan_id_fkey')
    expect(migrationSql).toContain('ALTER TABLE public.task_progress')
    expect(migrationSql).toContain('REFERENCES public.compiled_plans(plan_id)')
    expect(migrationSql).toContain('ADD CONSTRAINT milestone_progress_plan_id_fkey')
    expect(migrationSql).toContain('ALTER TABLE public.milestone_progress')
    expect(migrationSql).toContain('ON DELETE CASCADE;')
  })
})
