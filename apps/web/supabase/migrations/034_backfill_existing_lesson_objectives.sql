BEGIN;

DO $$
DECLARE
  v_canonical_capability_slugs text[] := ARRAY[
    'scope-definition',
    'workflow-planning',
    'task-breakdown',
    'tooling-setup',
    'repo-initialization',
    'local-development',
    'version-control',
    'codebase-orientation',
    'styling-setup',
    'component-composition',
    'layout-building',
    'page-design',
    'routing',
    'design-consistency',
    'backend-setup',
    'env-management',
    'data-modeling',
    'database-read',
    'database-write',
    'auth-basics',
    'deployment-prep',
    'deployment',
    'production-debugging',
    'launch-verification',
    'polish',
    'handoff',
    'roadmapping',
    'database-modeling',
    'seo-basics',
    'supabase-setup',
    'vercel-deploy',
    'workflow-design',
    'ai-prompt-engineering',
    'tool-integration',
    'ai-writing',
    'content-strategy',
    'multimedia-creation',
    'prototyping',
    'ai-integration'
  ];
BEGIN
  INSERT INTO lesson_objectives (lesson_id, capability_id, weight)
  WITH lesson_identity_lookup AS (
    SELECT
      lessons.id AS legacy_lesson_id,
      lessons.tags,
      lessons.content_types,
      COALESCE(identity_by_id.id, identity_by_slug.id) AS lesson_id,
      COALESCE(identity_by_id.domain_ids, identity_by_slug.domain_ids, '{}'::uuid[]) AS domain_ids
    FROM lessons
    LEFT JOIN lesson_identities AS identity_by_id
      ON identity_by_id.id = lessons.id
    LEFT JOIN lesson_identities AS identity_by_slug
      ON identity_by_slug.slug = lessons.id::text
  ),
  raw_objective_inputs AS (
    SELECT
      lesson_identity_lookup.lesson_id,
      lesson_identity_lookup.domain_ids,
      lower(trim(input.value)) AS raw_tag,
      min(input.ordinality) AS ordinality
    FROM lesson_identity_lookup
    CROSS JOIN LATERAL unnest(
      COALESCE(lesson_identity_lookup.tags, '{}'::text[]) ||
      COALESCE(lesson_identity_lookup.content_types, '{}'::text[])
    ) WITH ORDINALITY AS input(value, ordinality)
    WHERE lesson_identity_lookup.lesson_id IS NOT NULL
      AND cardinality(lesson_identity_lookup.domain_ids) > 0
      AND trim(input.value) <> ''
    GROUP BY
      lesson_identity_lookup.lesson_id,
      lesson_identity_lookup.domain_ids,
      lower(trim(input.value))
  ),
  resolved_objective_slugs AS (
    SELECT
      raw_objective_inputs.lesson_id,
      raw_objective_inputs.domain_ids,
      raw_objective_inputs.ordinality,
      CASE
        WHEN raw_objective_inputs.raw_tag = ANY(v_canonical_capability_slugs)
          THEN raw_objective_inputs.raw_tag
        WHEN raw_objective_inputs.raw_tag = 'start-project'
          THEN 'scope-definition'
        WHEN raw_objective_inputs.raw_tag = 'mvp-planning'
          THEN 'workflow-planning'
        WHEN raw_objective_inputs.raw_tag = 'setup-environment'
          THEN 'tooling-setup'
        WHEN raw_objective_inputs.raw_tag = 'create-project'
          THEN 'repo-initialization'
        WHEN raw_objective_inputs.raw_tag = 'build-ui'
          THEN 'component-composition'
        WHEN raw_objective_inputs.raw_tag = 'improve-design'
          THEN 'design-consistency'
        WHEN raw_objective_inputs.raw_tag = 'connect-database'
          THEN 'backend-setup'
        WHEN raw_objective_inputs.raw_tag = 'vercel'
          THEN 'vercel-deploy'
        WHEN raw_objective_inputs.raw_tag = 'database_write'
          THEN 'supabase-setup'
        WHEN raw_objective_inputs.raw_tag = 'データ設計'
          THEN 'database-modeling'
        WHEN raw_objective_inputs.raw_tag = 'deploy-site'
          THEN 'vercel-deploy'
        WHEN raw_objective_inputs.raw_tag = 'go-live'
          THEN 'launch-verification'
        WHEN raw_objective_inputs.raw_tag = 'finish-project'
          THEN 'handoff'
        WHEN raw_objective_inputs.raw_tag = 'iterate-product'
          THEN 'roadmapping'
        WHEN raw_objective_inputs.raw_tag = 'deploy-app'
          THEN 'vercel-deploy'
        WHEN raw_objective_inputs.raw_tag = 'deploy-site-to-vercel'
          THEN 'vercel-deploy'
        ELSE NULL
      END AS capability_slug
    FROM raw_objective_inputs
  ),
  deduplicated_objectives AS (
    SELECT
      resolved_objective_slugs.lesson_id,
      resolved_objective_slugs.domain_ids,
      resolved_objective_slugs.capability_slug,
      min(resolved_objective_slugs.ordinality) AS ordinality
    FROM resolved_objective_slugs
    WHERE resolved_objective_slugs.capability_slug IS NOT NULL
    GROUP BY
      resolved_objective_slugs.lesson_id,
      resolved_objective_slugs.domain_ids,
      resolved_objective_slugs.capability_slug
  ),
  ranked_objectives AS (
    SELECT
      deduplicated_objectives.lesson_id,
      capabilities.id AS capability_id,
      row_number() OVER (
        PARTITION BY deduplicated_objectives.lesson_id
        ORDER BY deduplicated_objectives.ordinality, deduplicated_objectives.capability_slug
      ) AS objective_rank
    FROM deduplicated_objectives
    JOIN capabilities
      ON capabilities.slug = deduplicated_objectives.capability_slug
     AND capabilities.domain_id = ANY(deduplicated_objectives.domain_ids)
  )
  SELECT
    ranked_objectives.lesson_id,
    ranked_objectives.capability_id,
    CASE
      WHEN ranked_objectives.objective_rank = 1 THEN 'primary'
      ELSE 'secondary'
    END AS weight
  FROM ranked_objectives
  ON CONFLICT (lesson_id, capability_id) DO NOTHING;
END $$;

COMMIT;
