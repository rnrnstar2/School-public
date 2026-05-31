-- ============================================
-- Learning plans / milestones for planner UI
-- 作成日: 2026-03-12
-- ============================================

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT,
  summary TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE plans IS 'AI generated learning plans.';
COMMENT ON COLUMN plans.user_id IS 'Null means a shared sample plan.';
COMMENT ON COLUMN plans.goal IS 'Original learner goal.';
COMMENT ON COLUMN plans.summary IS 'Plan summary shown on planner page.';

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE milestones IS 'Ordered milestones within a learning plan.';

CREATE TABLE IF NOT EXISTS milestone_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (milestone_id, lesson_id)
);

COMMENT ON TABLE milestone_lessons IS 'Ordered lessons assigned to a milestone.';
COMMENT ON COLUMN milestone_lessons.rationale IS 'Why this lesson appears at this point in the plan.';

CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_is_active ON plans(is_active);
CREATE INDEX IF NOT EXISTS idx_milestones_plan_id_order ON milestones(plan_id, order_index);
CREATE INDEX IF NOT EXISTS idx_milestone_lessons_milestone_id_order ON milestone_lessons(milestone_id, order_index);
CREATE INDEX IF NOT EXISTS idx_milestone_lessons_lesson_id ON milestone_lessons(lesson_id);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_select" ON plans;
CREATE POLICY "plans_select"
  ON plans
  FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "plans_insert" ON plans;
CREATE POLICY "plans_insert"
  ON plans
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "plans_update" ON plans;
CREATE POLICY "plans_update"
  ON plans
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "milestones_select" ON milestones;
CREATE POLICY "milestones_select"
  ON milestones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM plans
      WHERE plans.id = milestones.plan_id
        AND (plans.user_id IS NULL OR plans.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "milestones_insert" ON milestones;
CREATE POLICY "milestones_insert"
  ON milestones
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM plans
      WHERE plans.id = milestones.plan_id
        AND plans.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "milestones_update" ON milestones;
CREATE POLICY "milestones_update"
  ON milestones
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM plans
      WHERE plans.id = milestones.plan_id
        AND plans.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "milestone_lessons_select" ON milestone_lessons;
CREATE POLICY "milestone_lessons_select"
  ON milestone_lessons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM milestones
      JOIN plans ON plans.id = milestones.plan_id
      WHERE milestones.id = milestone_lessons.milestone_id
        AND (plans.user_id IS NULL OR plans.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "milestone_lessons_insert" ON milestone_lessons;
CREATE POLICY "milestone_lessons_insert"
  ON milestone_lessons
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM milestones
      JOIN plans ON plans.id = milestones.plan_id
      WHERE milestones.id = milestone_lessons.milestone_id
        AND plans.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "milestone_lessons_update" ON milestone_lessons;
CREATE POLICY "milestone_lessons_update"
  ON milestone_lessons
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM milestones
      JOIN plans ON plans.id = milestones.plan_id
      WHERE milestones.id = milestone_lessons.milestone_id
        AND plans.user_id = auth.uid()
    )
  );

WITH sample_plan AS (
  SELECT COALESCE(
    (
      SELECT plans.id
      FROM plans
      WHERE plans.user_id IS NULL
        AND plans.title = 'TypeScript 3ステップ学習プラン'
      ORDER BY plans.created_at
      LIMIT 1
    ),
    '90000000-0000-0000-0000-000000000001'::UUID
  ) AS id
)
INSERT INTO plans (id, title, goal, summary, is_active, created_at, updated_at)
SELECT
  sample_plan.id,
  'TypeScript 3ステップ学習プラン',
  'TypeScript の基礎を順番に学び、React 実装に入れる状態になる',
  '基礎理解から関数の型までを 3 lessons で一周し、次の UI 実装に進みやすい土台を作るサンプルプランです。',
  TRUE,
  NOW(),
  NOW()
FROM sample_plan
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  goal = EXCLUDED.goal,
  summary = EXCLUDED.summary,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

WITH sample_plan AS (
  SELECT COALESCE(
    (
      SELECT plans.id
      FROM plans
      WHERE plans.user_id IS NULL
        AND plans.title = 'TypeScript 3ステップ学習プラン'
      ORDER BY plans.created_at
      LIMIT 1
    ),
    '90000000-0000-0000-0000-000000000001'::UUID
  ) AS id
)
INSERT INTO milestones (id, plan_id, title, description, order_index, created_at)
SELECT
  COALESCE(
    (
      SELECT milestones.id
      FROM milestones
      WHERE milestones.plan_id = sample_plan.id
        AND milestones.title = values_table.title
      ORDER BY milestones.created_at
      LIMIT 1
    ),
    values_table.fallback_id
  ),
  sample_plan.id,
  values_table.title,
  values_table.description,
  values_table.order_index,
  NOW()
FROM sample_plan
JOIN (
  VALUES
    ('90000000-0000-0000-0000-000000000011'::UUID, '型の考え方をつかむ', 'TypeScript の目的と基本的な型を短く理解し、次の記述ルールへ進める状態を作ります。', 1),
    ('90000000-0000-0000-0000-000000000012'::UUID, '関数まで一気に接続する', '型の知識を関数定義へつなげて、実装で使う単位まで理解を固めます。', 2)
) AS values_table(fallback_id, title, description, order_index) ON TRUE
ON CONFLICT (id) DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  order_index = EXCLUDED.order_index;

WITH sample_plan AS (
  SELECT COALESCE(
    (
      SELECT plans.id
      FROM plans
      WHERE plans.user_id IS NULL
        AND plans.title = 'TypeScript 3ステップ学習プラン'
      ORDER BY plans.created_at
      LIMIT 1
    ),
    '90000000-0000-0000-0000-000000000001'::UUID
  ) AS id
),
resolved_milestones AS (
  SELECT
    values_table.title,
    COALESCE(
      (
        SELECT milestones.id
        FROM milestones
        WHERE milestones.plan_id = sample_plan.id
          AND milestones.title = values_table.title
        ORDER BY milestones.created_at
        LIMIT 1
      ),
      values_table.fallback_id
    ) AS milestone_id
  FROM sample_plan
  JOIN (
    VALUES
      ('90000000-0000-0000-0000-000000000011'::UUID, '型の考え方をつかむ'),
      ('90000000-0000-0000-0000-000000000012'::UUID, '関数まで一気に接続する')
  ) AS values_table(fallback_id, title) ON TRUE
)
INSERT INTO milestone_lessons (id, milestone_id, lesson_id, order_index, rationale, created_at)
SELECT
  COALESCE(
    (
      SELECT milestone_lessons.id
      FROM milestone_lessons
      WHERE milestone_lessons.milestone_id = resolved_milestones.milestone_id
        AND milestone_lessons.lesson_id = lessons.id
      ORDER BY milestone_lessons.created_at
      LIMIT 1
    ),
    values_table.fallback_id
  ),
  resolved_milestones.milestone_id,
  lessons.id,
  values_table.order_index,
  values_table.rationale,
  NOW()
FROM resolved_milestones
JOIN (
  VALUES
    ('90000000-0000-0000-0000-000000000101'::UUID, '型の考え方をつかむ', 'TypeScriptとは', 1, 'まずは言語の役割を掴み、以後の型ルールを受け取りやすくします。'),
    ('90000000-0000-0000-0000-000000000102'::UUID, '型の考え方をつかむ', '基本的な型', 2, '最初の概念理解の直後に基本型へ進むことで、実装時の迷いを減らします。'),
    ('90000000-0000-0000-0000-000000000103'::UUID, '関数まで一気に接続する', '関数と型', 1, '基本型を関数定義へ接続し、次の React 実装に必要な型の使い方へ進みます。')
) AS values_table(fallback_id, milestone_title, lesson_title, order_index, rationale)
  ON values_table.milestone_title = resolved_milestones.title
JOIN courses
  ON courses.title = 'TypeScript入門'
JOIN lessons
  ON lessons.course_id = courses.id
 AND lessons.title = values_table.lesson_title
ON CONFLICT (id) DO UPDATE SET
  milestone_id = EXCLUDED.milestone_id,
  lesson_id = EXCLUDED.lesson_id,
  order_index = EXCLUDED.order_index,
  rationale = EXCLUDED.rationale;
