BEGIN;

CREATE TYPE decision_ledger.owner_type_enum AS ENUM (
  'user',
  'ai',
  'both',
  'external',
  'blocked'
);

ALTER TABLE decision_ledger.goal_nodes
  ADD COLUMN owner_type decision_ledger.owner_type_enum NOT NULL DEFAULT 'user',
  ADD COLUMN depends_on_node_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN fallback_node_id uuid REFERENCES decision_ledger.goal_nodes(id) ON DELETE SET NULL;

CREATE INDEX idx_goal_nodes_owner_type
  ON decision_ledger.goal_nodes (owner_type);

COMMIT;
