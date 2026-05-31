BEGIN;

CREATE OR REPLACE FUNCTION public.sync_legacy_lesson_to_canonical(payload jsonb)
RETURNS TABLE (
  lesson_id uuid,
  lesson_version_id uuid,
  block_count integer,
  objective_count integer,
  content_tag_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson_id uuid := (payload->>'legacy_lesson_id')::uuid;
  v_slug text := COALESCE(NULLIF(payload->>'slug', ''), payload->>'legacy_lesson_id');
  v_title text := COALESCE(NULLIF(payload->>'title', ''), payload->>'legacy_lesson_id');
  v_domain_slug text := NULLIF(payload->>'domain_slug', '');
  v_domain_id uuid;
  v_version integer := COALESCE(NULLIF(payload->>'version', '')::integer, 1);
  v_status text := COALESCE(NULLIF(payload->>'status', ''), 'published');
  v_lesson_version_id uuid;
  v_block_count integer := 0;
  v_objective_count integer := 0;
  v_content_tag_count integer := 0;
BEGIN
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'legacy_lesson_id is required';
  END IF;

  IF v_domain_slug IS NOT NULL THEN
    SELECT id
    INTO v_domain_id
    FROM domains
    WHERE slug = v_domain_slug;
  END IF;

  INSERT INTO lesson_identities (id, slug, title, domain_ids)
  VALUES (
    v_lesson_id,
    v_slug,
    v_title,
    CASE
      WHEN v_domain_id IS NULL THEN '{}'::uuid[]
      ELSE ARRAY[v_domain_id]
    END
  )
  ON CONFLICT (id) DO UPDATE
  SET
    slug = EXCLUDED.slug,
    title = EXCLUDED.title,
    domain_ids = CASE
      WHEN cardinality(EXCLUDED.domain_ids) > 0 THEN EXCLUDED.domain_ids
      ELSE lesson_identities.domain_ids
    END;

  INSERT INTO lesson_versions (lesson_id, version, status, published_at)
  VALUES (
    v_lesson_id,
    v_version,
    v_status,
    CASE
      WHEN v_status = 'published' THEN now()
      ELSE NULL
    END
  )
  ON CONFLICT (lesson_id, version) DO UPDATE
  SET
    status = EXCLUDED.status,
    published_at = CASE
      WHEN EXCLUDED.status = 'published' THEN COALESCE(lesson_versions.published_at, EXCLUDED.published_at, now())
      ELSE NULL
    END
  RETURNING id INTO v_lesson_version_id;

  DELETE FROM lesson_blocks
  WHERE lesson_version_id = v_lesson_version_id;

  INSERT INTO lesson_blocks (lesson_version_id, type, sort_order, content)
  SELECT
    v_lesson_version_id,
    block.item->>'type',
    COALESCE(NULLIF(block.item->>'sort_order', '')::integer, block.ordinality - 1),
    COALESCE(block.item->'content', '{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(payload->'blocks', '[]'::jsonb)) WITH ORDINALITY AS block(item, ordinality)
  WHERE block.item ? 'type';

  GET DIAGNOSTICS v_block_count = ROW_COUNT;

  DELETE FROM lesson_objectives
  WHERE lesson_id = v_lesson_id;

  IF v_domain_id IS NOT NULL THEN
    WITH objective_inputs AS (
      SELECT
        lower(trim(objective.slug)) AS slug,
        min(objective.ordinality) AS ordinality
      FROM jsonb_array_elements_text(COALESCE(payload->'objective_slugs', '[]'::jsonb))
        WITH ORDINALITY AS objective(slug, ordinality)
      WHERE trim(objective.slug) <> ''
      GROUP BY lower(trim(objective.slug))
    ),
    resolved AS (
      SELECT
        objective_inputs.ordinality,
        capabilities.id AS capability_id
      FROM objective_inputs
      JOIN capabilities
        ON capabilities.domain_id = v_domain_id
       AND capabilities.slug = objective_inputs.slug
    )
    INSERT INTO lesson_objectives (lesson_id, capability_id, weight)
    SELECT
      v_lesson_id,
      resolved.capability_id,
      CASE
        WHEN row_number() OVER (ORDER BY resolved.ordinality) = 1 THEN 'primary'
        ELSE 'secondary'
      END
    FROM resolved
    ORDER BY resolved.ordinality;

    GET DIAGNOSTICS v_objective_count = ROW_COUNT;
  END IF;

  WITH tag_inputs AS (
    SELECT
      lower(trim(tag.item->>'slug')) AS slug,
      COALESCE(NULLIF(trim(tag.item->>'label'), ''), trim(tag.item->>'slug')) AS label,
      CASE
        WHEN tag.item->>'category' IN ('skill', 'tool', 'topic', 'persona') THEN tag.item->>'category'
        ELSE 'topic'
      END AS category,
      min(tag.ordinality) AS ordinality
    FROM jsonb_array_elements(COALESCE(payload->'content_tags', '[]'::jsonb)) WITH ORDINALITY AS tag(item, ordinality)
    WHERE trim(COALESCE(tag.item->>'slug', '')) <> ''
    GROUP BY
      lower(trim(tag.item->>'slug')),
      COALESCE(NULLIF(trim(tag.item->>'label'), ''), trim(tag.item->>'slug')),
      CASE
        WHEN tag.item->>'category' IN ('skill', 'tool', 'topic', 'persona') THEN tag.item->>'category'
        ELSE 'topic'
      END
  )
  INSERT INTO content_tags (slug, label, category)
  SELECT slug, label, category
  FROM tag_inputs
  ON CONFLICT (slug) DO UPDATE
  SET
    label = EXCLUDED.label,
    category = EXCLUDED.category;

  DELETE FROM lesson_content_tags
  WHERE lesson_id = v_lesson_id;

  WITH tag_inputs AS (
    SELECT
      lower(trim(tag.item->>'slug')) AS slug,
      min(tag.ordinality) AS ordinality
    FROM jsonb_array_elements(COALESCE(payload->'content_tags', '[]'::jsonb)) WITH ORDINALITY AS tag(item, ordinality)
    WHERE trim(COALESCE(tag.item->>'slug', '')) <> ''
    GROUP BY lower(trim(tag.item->>'slug'))
  )
  INSERT INTO lesson_content_tags (lesson_id, tag_id)
  SELECT
    v_lesson_id,
    content_tags.id
  FROM tag_inputs
  JOIN content_tags
    ON content_tags.slug = tag_inputs.slug
  ORDER BY tag_inputs.ordinality;

  GET DIAGNOSTICS v_content_tag_count = ROW_COUNT;

  RETURN QUERY
  SELECT
    v_lesson_id,
    v_lesson_version_id,
    v_block_count,
    v_objective_count,
    v_content_tag_count;
END;
$$;

COMMIT;
