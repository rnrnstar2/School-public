BEGIN;

DROP VIEW IF EXISTS public.capability_state_vw;

CREATE VIEW public.capability_state_vw
WITH (security_invoker = true) AS
SELECT DISTINCT ON (user_id, capability_id)
  user_id,
  capability_id,
  score AS latest_score,
  assessed_at AS latest_assessed_at
FROM public.competency_assessments
ORDER BY user_id, capability_id, assessed_at DESC, id DESC;

REVOKE ALL ON public.capability_state_vw FROM anon;
GRANT SELECT ON public.capability_state_vw TO authenticated;

COMMIT;
