-- 1) Move follower helpers into the private schema, keep public wrappers as SECURITY INVOKER
CREATE OR REPLACE FUNCTION private.is_follower(_follower uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _follower IS NOT NULL AND _target IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.follows WHERE follower_id = _follower AND following_id = _target
  );
$$;

CREATE OR REPLACE FUNCTION private.is_mutual_follow(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _a IS NOT NULL AND _b IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = _a AND following_id = _b)
     AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = _b AND following_id = _a);
$$;

REVOKE ALL ON FUNCTION private.is_follower(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_mutual_follow(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_follower(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_mutual_follow(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_follower(_follower uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public', 'private' AS $$
  SELECT private.is_follower(_follower, _target);
$$;

CREATE OR REPLACE FUNCTION public.is_mutual_follow(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public', 'private' AS $$
  SELECT private.is_mutual_follow(_a, _b);
$$;

-- 2) Column-level restriction of profiles for anonymous visitors
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, username, display_name, bio, avatar_url, website, is_private,
  xp_total, thought_of_day, thought_updated_at, created_at
) ON public.profiles TO anon;