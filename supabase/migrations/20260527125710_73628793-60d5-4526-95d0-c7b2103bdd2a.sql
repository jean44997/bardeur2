CREATE OR REPLACE FUNCTION public.can_view_profile_content(_viewer_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _owner_id
      AND (
        COALESCE(p.is_private, false) = false
        OR _viewer_id = _owner_id
        OR (
          _viewer_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.follower_id = _viewer_id AND f.following_id = _owner_id
          )
        )
      )
  );
$$;

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.can_view_profile_content(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_video_views(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_profile_xp(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_daily_xp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_live_message_read(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_live_chat_seen(uuid, uuid) TO authenticated;