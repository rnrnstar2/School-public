BEGIN;
DROP TABLE IF EXISTS public.milestone_lessons CASCADE;
DROP TABLE IF EXISTS public.milestones CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;

-- Clean up legacy plans.id-derived orphan rows before adding compiled_plans FK.
DELETE FROM public.task_progress
WHERE plan_id IS NOT NULL
  AND plan_id NOT IN (SELECT plan_id FROM public.compiled_plans);

DELETE FROM public.milestone_progress
WHERE plan_id IS NOT NULL
  AND plan_id NOT IN (SELECT plan_id FROM public.compiled_plans);

DROP POLICY IF EXISTS "task_progress_select" ON public.task_progress;
CREATE POLICY "task_progress_select"
  ON public.task_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.compiled_plans
      WHERE compiled_plans.plan_id = task_progress.plan_id
        AND compiled_plans.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "task_progress_insert" ON public.task_progress;
CREATE POLICY "task_progress_insert"
  ON public.task_progress
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.compiled_plans
      WHERE compiled_plans.plan_id = task_progress.plan_id
        AND compiled_plans.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "task_progress_update" ON public.task_progress;
CREATE POLICY "task_progress_update"
  ON public.task_progress
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.compiled_plans
      WHERE compiled_plans.plan_id = task_progress.plan_id
        AND compiled_plans.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "task_progress_delete" ON public.task_progress;
CREATE POLICY "task_progress_delete"
  ON public.task_progress
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.compiled_plans
      WHERE compiled_plans.plan_id = task_progress.plan_id
        AND compiled_plans.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'task_progress_plan_id_fkey'
      AND conrelid = 'public.task_progress'::regclass
  ) THEN
    ALTER TABLE public.task_progress
      ADD CONSTRAINT task_progress_plan_id_fkey
      FOREIGN KEY (plan_id)
      REFERENCES public.compiled_plans(plan_id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'milestone_progress_plan_id_fkey'
      AND conrelid = 'public.milestone_progress'::regclass
  ) THEN
    ALTER TABLE public.milestone_progress
      ADD CONSTRAINT milestone_progress_plan_id_fkey
      FOREIGN KEY (plan_id)
      REFERENCES public.compiled_plans(plan_id)
      ON DELETE CASCADE;
  END IF;
END
$$;
COMMIT;
