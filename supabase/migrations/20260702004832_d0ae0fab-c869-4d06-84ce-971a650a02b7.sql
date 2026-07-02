
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT
  id,
  username,
  display_name,
  bio,
  avatar_url,
  website,
  is_private,
  xp_total,
  thought_of_day,
  thought_updated_at,
  created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
