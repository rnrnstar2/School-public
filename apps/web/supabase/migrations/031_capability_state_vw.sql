CREATE OR REPLACE VIEW public.capability_state_vw
WITH (security_invoker = true) AS
SELECT
  user_id,
  capability_id,
  MAX(score) AS latest_score,
  MAX(assessed_at) AS latest_assessed_at
FROM public.competency_assessments
GROUP BY user_id, capability_id;

REVOKE ALL ON public.capability_state_vw FROM anon;
GRANT SELECT ON public.capability_state_vw TO authenticated;
