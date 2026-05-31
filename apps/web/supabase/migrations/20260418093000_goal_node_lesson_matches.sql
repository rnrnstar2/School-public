-- TQ-147: goal_node_lesson_matches shadow-match storage
-- Stores top-N lesson matches for each shadow-written goal node.

BEGIN;

CREATE TABLE IF NOT EXISTS decision_ledger.goal_node_lesson_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_node_id uuid NOT NULL REFERENCES decision_ledger.goal_nodes(id) ON DELETE CASCADE,
  lesson_id text NOT NULL,
  lesson_version_id text,
  score numeric(5,4) NOT NULL,
  rationale text,
  selected boolean NOT NULL DEFAULT false,
  coverage_snapshot_id uuid REFERENCES public.coverage_index_snapshots(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_node_lesson_matches_goal_node
  ON decision_ledger.goal_node_lesson_matches (goal_node_id);

CREATE INDEX IF NOT EXISTS idx_goal_node_lesson_matches_lesson
  ON decision_ledger.goal_node_lesson_matches (lesson_id);

ALTER TABLE decision_ledger.goal_node_lesson_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON decision_ledger.goal_node_lesson_matches;
CREATE POLICY service_role_all ON decision_ledger.goal_node_lesson_matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE decision_ledger.goal_node_lesson_matches TO service_role;

COMMIT;
