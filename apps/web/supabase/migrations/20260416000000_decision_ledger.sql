-- TQ-130: Decision Ledger minimal schema (8 tables)
-- Creates decision_ledger schema with goal/action/schedule/agent_run/evaluation/approval entities.
-- Write/Read access is restricted to service_role only in this TQ; UI-facing RLS is deferred.

BEGIN;

CREATE SCHEMA IF NOT EXISTS decision_ledger;

-- 1. goals --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_ledger.goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','paused','completed','archived')),
  deadline    date,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_user_status
  ON decision_ledger.goals (user_id, status);

-- 2. goal_nodes ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_ledger.goal_nodes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id        uuid NOT NULL REFERENCES decision_ledger.goals(id) ON DELETE CASCADE,
  parent_node_id uuid REFERENCES decision_ledger.goal_nodes(id) ON DELETE CASCADE,
  label          text NOT NULL,
  node_type      text NOT NULL DEFAULT 'task'
                   CHECK (node_type IN ('objective','milestone','task','sub_task')),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','done','blocked','skipped')),
  sort_order     integer NOT NULL DEFAULT 0,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goal_nodes_goal
  ON decision_ledger.goal_nodes (goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_nodes_parent
  ON decision_ledger.goal_nodes (parent_node_id);

-- 3. goal_contexts ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_ledger.goal_contexts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      uuid NOT NULL REFERENCES decision_ledger.goals(id) ON DELETE CASCADE,
  node_id      uuid REFERENCES decision_ledger.goal_nodes(id) ON DELETE SET NULL,
  source_type  text NOT NULL
                 CHECK (source_type IN ('doc','telemetry','meeting_note','issue','eval_result','other')),
  source_uri   text,
  content      text NOT NULL,
  freshness_at timestamptz,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goal_contexts_goal
  ON decision_ledger.goal_contexts (goal_id, source_type);

-- 4. proposed_actions ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_ledger.proposed_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         uuid NOT NULL REFERENCES decision_ledger.goals(id) ON DELETE CASCADE,
  node_id         uuid REFERENCES decision_ledger.goal_nodes(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  action_type     text NOT NULL DEFAULT 'task'
                    CHECK (action_type IN ('task','pr','migration','analysis','communication','other')),
  priority        text NOT NULL DEFAULT 'P2'
                    CHECK (priority IN ('P0','P1','P2','P3')),
  status          text NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','approved','rejected','in_progress','done','cancelled')),
  rationale       text,
  estimated_effort_hours numeric(5,2),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_by     text NOT NULL DEFAULT 'ai',
  proposed_at     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposed_actions_goal_status
  ON decision_ledger.proposed_actions (goal_id, status);
CREATE INDEX IF NOT EXISTS idx_proposed_actions_priority
  ON decision_ledger.proposed_actions (priority, status);

-- 5. schedule_slots -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_ledger.schedule_slots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id     uuid NOT NULL REFERENCES decision_ledger.proposed_actions(id) ON DELETE CASCADE,
  goal_id       uuid NOT NULL REFERENCES decision_ledger.goals(id) ON DELETE CASCADE,
  due_at        timestamptz,
  assignee_type text NOT NULL DEFAULT 'human'
                  CHECK (assignee_type IN ('human','ai','codex','claude')),
  assignee_ref  text,
  confidence    numeric(3,2) CHECK (confidence BETWEEN 0 AND 1),
  dry_run       boolean NOT NULL DEFAULT true,
  scheduled_by  text NOT NULL DEFAULT 'ai',
  scheduled_at  timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_action
  ON decision_ledger.schedule_slots (action_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_due
  ON decision_ledger.schedule_slots (due_at, assignee_type);

-- 6. agent_runs ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_ledger.agent_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id      uuid REFERENCES decision_ledger.proposed_actions(id) ON DELETE SET NULL,
  goal_id        uuid REFERENCES decision_ledger.goals(id) ON DELETE SET NULL,
  agent_type     text NOT NULL
                   CHECK (agent_type IN ('codex','claude','script','human','other')),
  run_status     text NOT NULL DEFAULT 'running'
                   CHECK (run_status IN ('running','success','failed','cancelled','timeout')),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  input_summary  text,
  output_summary text,
  artifacts      jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message  text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_action
  ON decision_ledger.agent_runs (action_id, run_status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_goal
  ON decision_ledger.agent_runs (goal_id, started_at DESC);

-- 7. evaluation_runs ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_ledger.evaluation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id  uuid REFERENCES decision_ledger.agent_runs(id) ON DELETE SET NULL,
  action_id     uuid REFERENCES decision_ledger.proposed_actions(id) ON DELETE SET NULL,
  goal_id       uuid REFERENCES decision_ledger.goals(id) ON DELETE SET NULL,
  evaluator     text NOT NULL DEFAULT 'judge_model',
  score         numeric(4,2),
  max_score     numeric(4,2) NOT NULL DEFAULT 10,
  verdict       text NOT NULL DEFAULT 'pending'
                  CHECK (verdict IN ('pass','fail','warn','pending','skipped')),
  rubric_ref    text,
  fail_reasons  text[] NOT NULL DEFAULT '{}',
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_agent
  ON decision_ledger.evaluation_runs (agent_run_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_verdict
  ON decision_ledger.evaluation_runs (goal_id, verdict);

-- 8. approval_gates -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS decision_ledger.approval_gates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id    uuid REFERENCES decision_ledger.proposed_actions(id) ON DELETE SET NULL,
  goal_id      uuid REFERENCES decision_ledger.goals(id) ON DELETE SET NULL,
  gate_type    text NOT NULL DEFAULT 'general'
                 CHECK (gate_type IN ('deploy','migration','schedule_confirm','budget','general')),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','expired')),
  requested_by text NOT NULL DEFAULT 'ai',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by   text,
  decided_at   timestamptz,
  reason       text,
  expires_at   timestamptz,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_approval_gates_status
  ON decision_ledger.approval_gates (status, gate_type);
CREATE INDEX IF NOT EXISTS idx_approval_gates_goal
  ON decision_ledger.approval_gates (goal_id, status);

-- ---------------------------------------------------------------------------
-- RLS: service_role only for this TQ (UI-facing RLS deferred)
-- ---------------------------------------------------------------------------

ALTER TABLE decision_ledger.goals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_ledger.goal_nodes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_ledger.goal_contexts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_ledger.proposed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_ledger.schedule_slots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_ledger.agent_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_ledger.evaluation_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_ledger.approval_gates   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON decision_ledger.goals;
CREATE POLICY service_role_all ON decision_ledger.goals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON decision_ledger.goal_nodes;
CREATE POLICY service_role_all ON decision_ledger.goal_nodes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON decision_ledger.goal_contexts;
CREATE POLICY service_role_all ON decision_ledger.goal_contexts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON decision_ledger.proposed_actions;
CREATE POLICY service_role_all ON decision_ledger.proposed_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON decision_ledger.schedule_slots;
CREATE POLICY service_role_all ON decision_ledger.schedule_slots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON decision_ledger.agent_runs;
CREATE POLICY service_role_all ON decision_ledger.agent_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON decision_ledger.evaluation_runs;
CREATE POLICY service_role_all ON decision_ledger.evaluation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all ON decision_ledger.approval_gates;
CREATE POLICY service_role_all ON decision_ledger.approval_gates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grants: expose schema + tables to service_role (PostgREST / Supabase admin)
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA decision_ledger TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA decision_ledger TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA decision_ledger TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA decision_ledger
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA decision_ledger
  GRANT ALL ON SEQUENCES TO service_role;

COMMIT;
