BEGIN;

-- ============================================================
-- Phase 5: Atom / Anchor / Compiled Plan / Telemetry
-- ============================================================

-- ------------------------------------------------------------
-- 1. Lesson atom cache tables (Git remains source of truth)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lesson_atoms (
  atom_id text PRIMARY KEY,
  current_version_id uuid,
  source_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lesson_atom_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atom_id text NOT NULL REFERENCES lesson_atoms(atom_id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('draft', 'reviewed', 'experimental', 'stable', 'archived')),
  yaml_hash text,
  yaml_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_markdown text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by text NOT NULL DEFAULT 'lesson-factory-sync'
);

CREATE TABLE IF NOT EXISTS lesson_atom_capabilities (
  atom_id text NOT NULL REFERENCES lesson_atoms(atom_id) ON DELETE CASCADE,
  capability text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('input', 'output')),
  PRIMARY KEY (atom_id, capability, direction)
);

CREATE TABLE IF NOT EXISTS lesson_atom_prerequisites (
  atom_id text NOT NULL REFERENCES lesson_atoms(atom_id) ON DELETE CASCADE,
  prerequisite_atom_id text NOT NULL REFERENCES lesson_atoms(atom_id) ON DELETE CASCADE,
  strength text NOT NULL CHECK (strength IN ('hard', 'soft')),
  PRIMARY KEY (atom_id, prerequisite_atom_id, strength),
  CHECK (atom_id <> prerequisite_atom_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_atom_versions_atom_status
  ON lesson_atom_versions (atom_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lesson_atoms_current_version_id_fkey'
      AND conrelid = 'lesson_atoms'::regclass
  ) THEN
    ALTER TABLE lesson_atoms
      ADD CONSTRAINT lesson_atoms_current_version_id_fkey
      FOREIGN KEY (current_version_id)
      REFERENCES lesson_atom_versions(version_id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 2. Personas and anchor flows
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS personas (
  persona_id text PRIMARY KEY,
  current_version_id uuid,
  source_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id text NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
  yaml_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_personas (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id text NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1.0,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, persona_id)
);

CREATE TABLE IF NOT EXISTS lesson_anchors (
  anchor_id text PRIMARY KEY,
  persona_id text NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
  ordered_atom_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'personas_current_version_id_fkey'
      AND conrelid = 'personas'::regclass
  ) THEN
    ALTER TABLE personas
      ADD CONSTRAINT personas_current_version_id_fkey
      FOREIGN KEY (current_version_id)
      REFERENCES persona_versions(version_id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 3. Compiled plan cache
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS compiled_plans (
  plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona_id text REFERENCES personas(persona_id) ON DELETE SET NULL,
  goal text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_score numeric,
  unsupported_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  parent_plan_id uuid REFERENCES compiled_plans(plan_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compiled_plans_user_status
  ON compiled_plans (user_id, status);

CREATE INDEX IF NOT EXISTS idx_compiled_plans_parent_plan_id
  ON compiled_plans (parent_plan_id);

-- ------------------------------------------------------------
-- 4. Telemetry event store
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telemetry_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  atom_id text,
  atom_version_id uuid,
  plan_id uuid,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL CHECK (source IN ('server', 'client')),
  request_id text
);

ALTER TABLE telemetry_events
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS atom_id text,
  ADD COLUMN IF NOT EXISTS atom_version_id uuid,
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS request_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telemetry_events_atom_id_fkey'
      AND conrelid = 'telemetry_events'::regclass
  ) THEN
    ALTER TABLE telemetry_events
      ADD CONSTRAINT telemetry_events_atom_id_fkey
      FOREIGN KEY (atom_id)
      REFERENCES lesson_atoms(atom_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telemetry_events_atom_version_id_fkey'
      AND conrelid = 'telemetry_events'::regclass
  ) THEN
    ALTER TABLE telemetry_events
      ADD CONSTRAINT telemetry_events_atom_version_id_fkey
      FOREIGN KEY (atom_version_id)
      REFERENCES lesson_atom_versions(version_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telemetry_events_plan_id_fkey'
      AND conrelid = 'telemetry_events'::regclass
  ) THEN
    ALTER TABLE telemetry_events
      ADD CONSTRAINT telemetry_events_plan_id_fkey
      FOREIGN KEY (plan_id)
      REFERENCES compiled_plans(plan_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'telemetry_events_source_check'
      AND conrelid = 'telemetry_events'::regclass
  ) THEN
    ALTER TABLE telemetry_events
      ADD CONSTRAINT telemetry_events_source_check
      CHECK (source IN ('server', 'client'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_telemetry_events_user_name_occurred
  ON telemetry_events (user_id, event_name, occurred_at DESC);

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------

ALTER TABLE lesson_atoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_atom_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_atom_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_atom_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE compiled_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atoms'
      AND policyname = 'lesson_atoms_public_read'
  ) THEN
    CREATE POLICY lesson_atoms_public_read
      ON lesson_atoms
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atoms'
      AND policyname = 'lesson_atoms_service_all'
  ) THEN
    CREATE POLICY lesson_atoms_service_all
      ON lesson_atoms
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atom_versions'
      AND policyname = 'lesson_atom_versions_public_read'
  ) THEN
    CREATE POLICY lesson_atom_versions_public_read
      ON lesson_atom_versions
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atom_versions'
      AND policyname = 'lesson_atom_versions_service_all'
  ) THEN
    CREATE POLICY lesson_atom_versions_service_all
      ON lesson_atom_versions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atom_capabilities'
      AND policyname = 'lesson_atom_capabilities_public_read'
  ) THEN
    CREATE POLICY lesson_atom_capabilities_public_read
      ON lesson_atom_capabilities
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atom_capabilities'
      AND policyname = 'lesson_atom_capabilities_service_all'
  ) THEN
    CREATE POLICY lesson_atom_capabilities_service_all
      ON lesson_atom_capabilities
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atom_prerequisites'
      AND policyname = 'lesson_atom_prerequisites_public_read'
  ) THEN
    CREATE POLICY lesson_atom_prerequisites_public_read
      ON lesson_atom_prerequisites
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_atom_prerequisites'
      AND policyname = 'lesson_atom_prerequisites_service_all'
  ) THEN
    CREATE POLICY lesson_atom_prerequisites_service_all
      ON lesson_atom_prerequisites
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personas'
      AND policyname = 'personas_public_read'
  ) THEN
    CREATE POLICY personas_public_read
      ON personas
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personas'
      AND policyname = 'personas_service_all'
  ) THEN
    CREATE POLICY personas_service_all
      ON personas
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'persona_versions'
      AND policyname = 'persona_versions_public_read'
  ) THEN
    CREATE POLICY persona_versions_public_read
      ON persona_versions
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'persona_versions'
      AND policyname = 'persona_versions_service_all'
  ) THEN
    CREATE POLICY persona_versions_service_all
      ON persona_versions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_anchors'
      AND policyname = 'lesson_anchors_public_read'
  ) THEN
    CREATE POLICY lesson_anchors_public_read
      ON lesson_anchors
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_anchors'
      AND policyname = 'lesson_anchors_service_all'
  ) THEN
    CREATE POLICY lesson_anchors_service_all
      ON lesson_anchors
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_personas'
      AND policyname = 'user_personas_owner_select'
  ) THEN
    CREATE POLICY user_personas_owner_select
      ON user_personas
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_personas'
      AND policyname = 'user_personas_owner_insert'
  ) THEN
    CREATE POLICY user_personas_owner_insert
      ON user_personas
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_personas'
      AND policyname = 'user_personas_service_all'
  ) THEN
    CREATE POLICY user_personas_service_all
      ON user_personas
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'compiled_plans'
      AND policyname = 'compiled_plans_owner_select'
  ) THEN
    CREATE POLICY compiled_plans_owner_select
      ON compiled_plans
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'compiled_plans'
      AND policyname = 'compiled_plans_owner_insert'
  ) THEN
    CREATE POLICY compiled_plans_owner_insert
      ON compiled_plans
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'compiled_plans'
      AND policyname = 'compiled_plans_service_all'
  ) THEN
    CREATE POLICY compiled_plans_service_all
      ON compiled_plans
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'telemetry_events'
      AND policyname = 'telemetry_events_owner_select'
  ) THEN
    CREATE POLICY telemetry_events_owner_select
      ON telemetry_events
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'telemetry_events'
      AND policyname = 'telemetry_events_owner_insert'
  ) THEN
    CREATE POLICY telemetry_events_owner_insert
      ON telemetry_events
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'telemetry_events'
      AND policyname = 'telemetry_events_service_all'
  ) THEN
    CREATE POLICY telemetry_events_service_all
      ON telemetry_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 6. unsupported_goal_log daily aggregation from compiled_plans
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_daily_unsupported_capabilities(target_day date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  WITH exploded AS (
    SELECT
      cp.goal,
      jsonb_array_elements_text(cp.unsupported_capabilities) AS capability
    FROM compiled_plans AS cp
    WHERE cp.created_at >= target_day::timestamptz
      AND cp.created_at < (target_day + 1)::timestamptz
      AND jsonb_typeof(cp.unsupported_capabilities) = 'array'
      AND jsonb_array_length(cp.unsupported_capabilities) > 0
  ),
  aggregated AS (
    SELECT
      capability,
      count(*) AS occurrence_count,
      array_agg(DISTINCT goal ORDER BY goal) AS sample_goals
    FROM exploded
    GROUP BY capability
  ),
  inserted AS (
    INSERT INTO unsupported_goal_log (
      user_id,
      goal,
      normalized_goal,
      matched_intent,
      support_status,
      hearing,
      created_at
    )
    SELECT
      NULL,
      format('[daily aggregate] %s', capability),
      capability,
      'unsupported_capability_daily',
      'coming-soon',
      jsonb_build_object(
        'source', 'compiled_plans',
        'target_day', target_day,
        'count', occurrence_count,
        'sample_goals', sample_goals
      ),
      target_day::timestamptz + interval '12 hours'
    FROM aggregated
    WHERE NOT EXISTS (
      SELECT 1
      FROM unsupported_goal_log AS ugl
      WHERE ugl.matched_intent = 'unsupported_capability_daily'
        AND ugl.normalized_goal = aggregated.capability
        AND ugl.created_at >= target_day::timestamptz
        AND ugl.created_at < (target_day + 1)::timestamptz
    )
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count
  FROM inserted;

  RETURN inserted_count;
END;
$$;

COMMIT;
