DROP POLICY IF EXISTS "Authenticated can insert participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;

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
      AND p.proname IN (
        'add_profile_xp',
        'refresh_daily_xp',
        'mark_live_message_read',
        'mark_live_chat_seen',
        'create_comment_notification',
        'create_follow_notification',
        'create_like_notification',
        'create_message_notification',
        'create_share_notification',
        'guard_live_message_insert',
        'guard_message_insert',
        'handle_new_user',
        'record_flame_event_for_message',
        'set_live_message_delivered',
        'touch_chat_streak',
        'update_video_comments_count',
        'update_video_likes_count',
        'update_video_saves_count'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_video_views(uuid) TO authenticated;