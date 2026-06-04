-- 1. Fix broken direct_call_signals INSERT policy (tautology bug)
DROP POLICY IF EXISTS "Direct call users create signals" ON public.direct_call_signals;
CREATE POLICY "Direct call users create signals"
ON public.direct_call_signals
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND sender_id <> recipient_id
  AND EXISTS (
    SELECT 1 FROM public.direct_call_sessions d
    WHERE d.id = direct_call_signals.call_id
      AND (auth.uid() = d.caller_id OR auth.uid() = d.recipient_id)
      AND (direct_call_signals.recipient_id = d.caller_id
           OR direct_call_signals.recipient_id = d.recipient_id)
      AND public.is_conversation_participant(d.conversation_id, auth.uid())
  )
);

-- 2. Restrict follows / likes / shares SELECT
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON public.follows;
CREATE POLICY "Follows readable by authenticated"
ON public.follows FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
CREATE POLICY "Likes readable by authenticated"
ON public.likes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Shares are viewable" ON public.shares;
CREATE POLICY "Shares readable by owner"
ON public.shares FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE SELECT ON public.follows FROM anon;
REVOKE SELECT ON public.likes FROM anon;
REVOKE SELECT ON public.shares FROM anon;

-- 3. live_messages: restrict UPDATE to own message
DROP POLICY IF EXISTS "Users can update seen state on live messages" ON public.live_messages;
CREATE POLICY "Users can update own live messages"
ON public.live_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. notifications: enforce from_user_id = auth.uid()
DROP POLICY IF EXISTS "Authenticated can create notifications" ON public.notifications;
CREATE POLICY "Users can create notifications they originate"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (from_user_id IS NULL OR from_user_id = auth.uid())
);

-- 5. profiles: restrict to authenticated; expose minimal public view to anon
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated"
ON public.profiles FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.profiles FROM anon;

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT id, username, display_name, bio, avatar_url, website, is_private, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- 6. Storage ownership for DELETE / UPDATE on media + avatars
DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;

CREATE POLICY "Users can delete own media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = ANY (ARRAY['media','avatars'])
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR (
      (storage.foldername(name))[1] = 'live-stream'
      AND EXISTS (
        SELECT 1 FROM public.lives l
        WHERE l.id::text = (storage.foldername(name))[2]
          AND l.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can update own media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = ANY (ARRAY['media','avatars'])
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR (
      (storage.foldername(name))[1] = 'live-stream'
      AND EXISTS (
        SELECT 1 FROM public.lives l
        WHERE l.id::text = (storage.foldername(name))[2]
          AND l.user_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  bucket_id = ANY (ARRAY['media','avatars'])
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR (
      (storage.foldername(name))[1] = 'live-stream'
      AND EXISTS (
        SELECT 1 FROM public.lives l
        WHERE l.id::text = (storage.foldername(name))[2]
          AND l.user_id = auth.uid()
      )
    )
  )
);

-- 7. SECURITY DEFINER functions: lock down execute privileges
REVOKE EXECUTE ON FUNCTION public.add_profile_xp(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_stories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_daily_xp(uuid) FROM PUBLIC, anon, authenticated;

-- Client-callable: keep authenticated grant, drop anon/public
REVOKE EXECUTE ON FUNCTION public.send_admin_official_message(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_thought_of_day(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_live_chat_seen(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_live_message_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_admin_official_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_thought_of_day(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_live_chat_seen(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_live_message_read(uuid, uuid) TO authenticated;