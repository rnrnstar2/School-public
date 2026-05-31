-- TQ-156: learner read policies for the decision_ledger goal tree.
-- Grants browser clients read-only access to their own goals, nodes, contexts,
-- and lesson matches while leaving service_role write access intact.

BEGIN;

DROP POLICY IF EXISTS learner_select_own_goals ON decision_ledger.goals;
CREATE POLICY learner_select_own_goals
  ON decision_ledger.goals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS learner_select_own_goal_nodes ON decision_ledger.goal_nodes;
CREATE POLICY learner_select_own_goal_nodes
  ON decision_ledger.goal_nodes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM decision_ledger.goals g
       WHERE g.id = goal_nodes.goal_id
         AND g.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learner_select_own_goal_contexts ON decision_ledger.goal_contexts;
CREATE POLICY learner_select_own_goal_contexts
  ON decision_ledger.goal_contexts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM decision_ledger.goals g
       WHERE g.id = goal_contexts.goal_id
         AND g.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS learner_select_own_goal_node_lesson_matches ON decision_ledger.goal_node_lesson_matches;
CREATE POLICY learner_select_own_goal_node_lesson_matches
  ON decision_ledger.goal_node_lesson_matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM decision_ledger.goal_nodes n
        JOIN decision_ledger.goals g
          ON g.id = n.goal_id
       WHERE n.id = goal_node_lesson_matches.goal_node_id
         AND g.user_id = auth.uid()
    )
  );

GRANT USAGE ON SCHEMA decision_ledger TO authenticated;

GRANT SELECT ON TABLE
  decision_ledger.goals,
  decision_ledger.goal_nodes,
  decision_ledger.goal_contexts,
  decision_ledger.goal_node_lesson_matches
  TO authenticated;

COMMIT;
