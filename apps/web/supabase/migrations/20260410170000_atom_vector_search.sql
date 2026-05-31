-- Migration: atom_vector_search
-- Adds pgvector-based similarity search for lesson atoms.
-- Stage 1 of a 2-stage search pipeline (vector → LLM rerank).

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Create atom_search_index table
CREATE TABLE IF NOT EXISTS public.atom_search_index (
  atom_id TEXT PRIMARY KEY REFERENCES public.lesson_atoms(atom_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  goal_tags TEXT[] NOT NULL DEFAULT '{}',
  persona_tags TEXT[] NOT NULL DEFAULT '{}',
  capability_outputs TEXT[] NOT NULL DEFAULT '{}',
  hard_prerequisites TEXT[] NOT NULL DEFAULT '{}',
  estimated_minutes INT,
  embedding extensions.vector(1536),
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. IVFFlat index for cosine similarity search
-- lists=10 is appropriate for <1000 rows. Switch to HNSW when >5000 rows.
CREATE INDEX IF NOT EXISTS idx_atom_search_embedding
  ON public.atom_search_index
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 10);

-- 4. GIN indexes for tag filtering
CREATE INDEX IF NOT EXISTS idx_atom_search_goal_tags
  ON public.atom_search_index USING GIN (goal_tags);

CREATE INDEX IF NOT EXISTS idx_atom_search_persona_tags
  ON public.atom_search_index USING GIN (persona_tags);

-- 5. RPC function for similarity search
CREATE OR REPLACE FUNCTION public.search_atoms_by_embedding(
  query_embedding extensions.vector(1536),
  match_count INT DEFAULT 50,
  persona_filter TEXT[] DEFAULT NULL,
  goal_filter TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  atom_id TEXT,
  title TEXT,
  summary TEXT,
  goal_tags TEXT[],
  persona_tags TEXT[],
  capability_outputs TEXT[],
  hard_prerequisites TEXT[],
  estimated_minutes INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    asi.atom_id,
    asi.title,
    asi.summary,
    asi.goal_tags,
    asi.persona_tags,
    asi.capability_outputs,
    asi.hard_prerequisites,
    asi.estimated_minutes,
    1 - (asi.embedding <=> query_embedding) AS similarity
  FROM public.atom_search_index asi
  WHERE
    asi.embedding IS NOT NULL
    AND (persona_filter IS NULL OR asi.persona_tags && persona_filter)
    AND (goal_filter IS NULL OR asi.goal_tags && goal_filter)
  ORDER BY asi.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 6. Row Level Security
ALTER TABLE public.atom_search_index ENABLE ROW LEVEL SECURITY;

-- Read-only access for authenticated users
CREATE POLICY "atom_search_index_select" ON public.atom_search_index
  FOR SELECT TO authenticated USING (true);

-- Service role can manage (insert/update/delete)
CREATE POLICY "atom_search_index_service" ON public.atom_search_index
  FOR ALL TO service_role USING (true) WITH CHECK (true);
