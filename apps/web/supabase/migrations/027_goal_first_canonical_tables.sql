-- ============================================================
-- Migration 027: Goal-First Canonical Domain Model
-- ============================================================
-- Creates 21 new tables for the goal-first architecture.
-- All tables use RLS. Existing tables are NOT modified.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. domains
-- ============================================================
CREATE TABLE IF NOT EXISTS domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (slug IN ('web','automation','content','app')),
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domains_public_read" ON domains
  FOR SELECT USING (true);

-- ============================================================
-- 2. capabilities
-- ============================================================
CREATE TABLE IF NOT EXISTS capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id uuid NOT NULL REFERENCES domains(id),
  slug text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  rubric_criteria text NOT NULL DEFAULT '',
  UNIQUE(domain_id, slug)
);

ALTER TABLE capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capabilities_public_read" ON capabilities
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_capabilities_domain_id ON capabilities(domain_id);

-- ============================================================
-- 3. lesson_identities
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  domain_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lesson_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_identities_public_read" ON lesson_identities
  FOR SELECT USING (true);

-- ============================================================
-- 4. lesson_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lesson_identities(id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  published_at timestamptz,
  archived_at timestamptz,
  author_id uuid REFERENCES auth.users(id),
  changelog text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lesson_id, version)
);

ALTER TABLE lesson_versions ENABLE ROW LEVEL SECURITY;

-- Public read for published versions only
CREATE POLICY "lesson_versions_published_read" ON lesson_versions
  FOR SELECT USING (status = 'published');

CREATE INDEX IF NOT EXISTS idx_lesson_versions_lesson_status ON lesson_versions(lesson_id, status);

-- ============================================================
-- 5. lesson_blocks
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_version_id uuid NOT NULL REFERENCES lesson_versions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('markdown','image','video','checklist','quiz','code_prompt','reflection','rubric','callout','artifact_submit')),
  sort_order integer NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lesson_blocks ENABLE ROW LEVEL SECURITY;

-- Public read if the parent version is published
CREATE POLICY "lesson_blocks_published_read" ON lesson_blocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lesson_versions lv
      WHERE lv.id = lesson_blocks.lesson_version_id
        AND lv.status = 'published'
    )
  );

CREATE INDEX IF NOT EXISTS idx_lesson_blocks_version_sort ON lesson_blocks(lesson_version_id, sort_order);

-- ============================================================
-- 6. lesson_assets
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_version_id uuid NOT NULL REFERENCES lesson_versions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image','video','pdf','embed')),
  url text NOT NULL,
  storage_key text,
  mime_type text,
  alt_text text,
  caption text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lesson_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_assets_published_read" ON lesson_assets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lesson_versions lv
      WHERE lv.id = lesson_assets.lesson_version_id
        AND lv.status = 'published'
    )
  );

CREATE INDEX IF NOT EXISTS idx_lesson_assets_version ON lesson_assets(lesson_version_id);

-- ============================================================
-- 7. lesson_objectives
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lesson_identities(id),
  capability_id uuid NOT NULL REFERENCES capabilities(id),
  weight text NOT NULL DEFAULT 'primary' CHECK (weight IN ('primary','secondary')),
  UNIQUE(lesson_id, capability_id)
);

ALTER TABLE lesson_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_objectives_public_read" ON lesson_objectives
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_lesson_objectives_capability ON lesson_objectives(capability_id);

-- ============================================================
-- 8. lesson_prerequisites_v2
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_prerequisites_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lesson_identities(id),
  prerequisite_lesson_id uuid NOT NULL REFERENCES lesson_identities(id),
  strength text NOT NULL DEFAULT 'required' CHECK (strength IN ('required','recommended','reinforcing')),
  CHECK (lesson_id != prerequisite_lesson_id),
  UNIQUE(lesson_id, prerequisite_lesson_id)
);

ALTER TABLE lesson_prerequisites_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_prerequisites_v2_public_read" ON lesson_prerequisites_v2
  FOR SELECT USING (true);

-- ============================================================
-- 9. lesson_variants
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_version_id uuid NOT NULL REFERENCES lesson_versions(id) ON DELETE CASCADE,
  tool_profile_slug text NOT NULL CHECK (tool_profile_slug IN ('codex','claude-code','manual','v0')),
  override_blocks jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lesson_version_id, tool_profile_slug)
);

ALTER TABLE lesson_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_variants_published_read" ON lesson_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lesson_versions lv
      WHERE lv.id = lesson_variants.lesson_version_id
        AND lv.status = 'published'
    )
  );

-- ============================================================
-- 10. goals
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  outcome text NOT NULL,
  structured_intent jsonb,
  domain_ids uuid[] NOT NULL DEFAULT '{}',
  deadline timestamptz,
  current_skill text,
  preferred_tools text[] NOT NULL DEFAULT '{}',
  environment text,
  learning_style text,
  constraints jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_owner_select" ON goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "goals_owner_insert" ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "goals_owner_update" ON goals
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "goals_owner_delete" ON goals
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);

-- ============================================================
-- 11. plans_v2
-- ============================================================
CREATE TABLE IF NOT EXISTS plans_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  goal_id uuid NOT NULL REFERENCES goals(id),
  title text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','superseded','abandoned')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  parent_plan_id uuid REFERENCES plans_v2(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plans_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_v2_owner_select" ON plans_v2
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "plans_v2_owner_insert" ON plans_v2
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plans_v2_owner_update" ON plans_v2
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plans_v2_owner_delete" ON plans_v2
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_plans_v2_user_goal ON plans_v2(user_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_plans_v2_goal ON plans_v2(goal_id);

-- ============================================================
-- 12. plan_nodes
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans_v2(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lesson_identities(id),
  milestone_title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','skipped','blocked')),
  rationale text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_nodes ENABLE ROW LEVEL SECURITY;

-- Owner-only via plan join
CREATE POLICY "plan_nodes_owner_select" ON plan_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plans_v2 p
      WHERE p.id = plan_nodes.plan_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_nodes_owner_insert" ON plan_nodes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM plans_v2 p
      WHERE p.id = plan_nodes.plan_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_nodes_owner_update" ON plan_nodes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM plans_v2 p
      WHERE p.id = plan_nodes.plan_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_nodes_owner_delete" ON plan_nodes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM plans_v2 p
      WHERE p.id = plan_nodes.plan_id
        AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_plan_nodes_plan_sort ON plan_nodes(plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_plan_nodes_lesson ON plan_nodes(lesson_id);

-- ============================================================
-- 13. plan_revisions
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans_v2(id) ON DELETE CASCADE,
  reason text NOT NULL,
  changes_summary text NOT NULL DEFAULT '',
  superseded_node_ids uuid[] NOT NULL DEFAULT '{}',
  new_node_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_revisions_owner_select" ON plan_revisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM plans_v2 p
      WHERE p.id = plan_revisions.plan_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_revisions_owner_insert" ON plan_revisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM plans_v2 p
      WHERE p.id = plan_revisions.plan_id
        AND p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 14. evidence_submissions
-- ============================================================
CREATE TABLE IF NOT EXISTS evidence_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_node_id uuid REFERENCES plan_nodes(id),
  lesson_id uuid NOT NULL REFERENCES lesson_identities(id),
  type text NOT NULL CHECK (type IN ('url','repo','screenshot','text','artifact_metadata')),
  content text NOT NULL,
  metadata jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evidence_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_submissions_owner_select" ON evidence_submissions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "evidence_submissions_owner_insert" ON evidence_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_evidence_submissions_user_lesson ON evidence_submissions(user_id, lesson_id);

-- ============================================================
-- 15. competency_assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS competency_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  capability_id uuid NOT NULL REFERENCES capabilities(id),
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  rubric_results jsonb NOT NULL DEFAULT '{}',
  assessed_by text NOT NULL CHECK (assessed_by IN ('ai','mentor','self')),
  assessed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE competency_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competency_assessments_owner_select" ON competency_assessments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "competency_assessments_owner_insert" ON competency_assessments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_competency_assessments_user_cap ON competency_assessments(user_id, capability_id);

-- ============================================================
-- 16. graduation_decisions
-- ============================================================
CREATE TABLE IF NOT EXISTS graduation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  goal_id uuid NOT NULL REFERENCES goals(id),
  plan_id uuid NOT NULL REFERENCES plans_v2(id),
  status text NOT NULL CHECK (status IN ('graduated','not_ready')),
  competency_summary jsonb NOT NULL DEFAULT '{}',
  certificate_id uuid,
  decided_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE graduation_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "graduation_decisions_owner_select" ON graduation_decisions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "graduation_decisions_owner_insert" ON graduation_decisions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_graduation_decisions_user_goal ON graduation_decisions(user_id, goal_id);

-- ============================================================
-- 17. content_tags
-- ============================================================
CREATE TABLE IF NOT EXISTS content_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('skill','tool','topic','persona'))
);

ALTER TABLE content_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_tags_public_read" ON content_tags
  FOR SELECT USING (true);

-- ============================================================
-- 18. lesson_content_tags (join table)
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_content_tags (
  lesson_id uuid NOT NULL REFERENCES lesson_identities(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES content_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, tag_id)
);

ALTER TABLE lesson_content_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_content_tags_public_read" ON lesson_content_tags
  FOR SELECT USING (true);

-- ============================================================
-- 19. tool_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS tool_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  label text NOT NULL,
  category text NOT NULL,
  requires_local_install boolean NOT NULL DEFAULT false
);

ALTER TABLE tool_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tool_profiles_public_read" ON tool_profiles
  FOR SELECT USING (true);

-- ============================================================
-- 20. recommendation_events
-- ============================================================
CREATE TABLE IF NOT EXISTS recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  plan_node_id uuid REFERENCES plan_nodes(id),
  lesson_id uuid NOT NULL REFERENCES lesson_identities(id),
  reason_type text NOT NULL,
  reason_detail text NOT NULL DEFAULT '',
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recommendation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recommendation_events_owner_select" ON recommendation_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "recommendation_events_owner_insert" ON recommendation_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_events_user_lesson ON recommendation_events(user_id, lesson_id);

-- ============================================================
-- 21. track_views
-- ============================================================
CREATE TABLE IF NOT EXISTS track_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  label text NOT NULL,
  headline text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_learners text[] NOT NULL DEFAULT '{}',
  lesson_ids uuid[] NOT NULL DEFAULT '{}',
  domain_ids uuid[] NOT NULL DEFAULT '{}',
  icon text
);

ALTER TABLE track_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "track_views_public_read" ON track_views
  FOR SELECT USING (true);

-- ============================================================
-- Seed data: domains
-- ============================================================
INSERT INTO domains (slug, label, description, icon, sort_order) VALUES
  ('web',        'Web開発',           'Webサイト・Webアプリ制作の学習領域', 'globe',   0),
  ('automation', 'AI業務自動化',      'AIを活用した業務効率化・自動化の学習領域', 'zap',     1),
  ('content',    'AIコンテンツ制作',  'AIを使ったコンテンツ制作の学習領域', 'pen-tool', 2),
  ('app',        'AIアプリ制作',      'AIを組み込んだアプリ開発の学習領域', 'cpu',     3)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Seed data: tool_profiles
-- ============================================================
INSERT INTO tool_profiles (slug, label, category, requires_local_install) VALUES
  ('codex',       'OpenAI Codex',  'ai-agent',  true),
  ('claude-code', 'Claude Code',   'ai-agent',  true),
  ('manual',      'Manual (IDE)',  'editor',    false),
  ('v0',          'Vercel v0',     'ai-builder', false),
  ('cursor',      'Cursor',        'ai-editor', true)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
