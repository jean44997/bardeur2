-- Chat/calls/profile hardening: direct DM creation, comment ownership, sane counters and high-volume indexes.

CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_user_id uuid := auth.uid();
  _conversation_id uuid;
  _is_admin boolean := false;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _other_user_id IS NULL OR _current_user_id = _other_user_id THEN
    RAISE EXCEPTION 'Invalid conversation target';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _other_user_id) THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;

  _is_admin := public.has_role(_current_user_id, 'super_admin') OR public.has_role(_current_user_id, 'admin');

  IF NOT _is_admin
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_blocks')
     AND public.is_blocked_between(_current_user_id, _other_user_id) THEN
    RAISE EXCEPTION 'Conversation blocked';
  END IF;

  SELECT c.id INTO _conversation_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = _current_user_id
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = _other_user_id
  WHERE COALESCE(c.is_group, false) = false
  LIMIT 1;

  IF _conversation_id IS NOT NULL THEN
    RETURN _conversation_id;
  END IF;

  INSERT INTO public.conversations (is_group)
  VALUES (false)
  RETURNING id INTO _conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (_conversation_id, _current_user_id), (_conversation_id, _other_user_id);

  RETURN _conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view own videos" ON public.videos;
CREATE POLICY "Users can view own videos"
ON public.videos
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
DROP POLICY IF EXISTS "Users and video creators can delete comments" ON public.comments;
CREATE POLICY "Users and video creators can delete comments"
ON public.comments
FOR DELETE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.videos v
    WHERE v.id = comments.video_id AND v.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE OR REPLACE FUNCTION public.update_video_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_video_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_video_saves_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET saves_count = COALESCE(saves_count, 0) + 1 WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET saves_count = GREATEST(COALESCE(saves_count, 0) - 1, 0) WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_like_change ON public.likes;
DROP TRIGGER IF EXISTS likes_count_trigger ON public.likes;
DROP TRIGGER IF EXISTS update_likes_count ON public.likes;
CREATE TRIGGER likes_count_trigger
AFTER INSERT OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.update_video_likes_count();

DROP TRIGGER IF EXISTS on_comment_change ON public.comments;
DROP TRIGGER IF EXISTS comments_count_trigger ON public.comments;
DROP TRIGGER IF EXISTS update_comments_count ON public.comments;
CREATE TRIGGER comments_count_trigger
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.update_video_comments_count();

DROP TRIGGER IF EXISTS on_save_change ON public.saves;
DROP TRIGGER IF EXISTS saves_count_trigger ON public.saves;
DROP TRIGGER IF EXISTS update_saves_count ON public.saves;
CREATE TRIGGER saves_count_trigger
AFTER INSERT OR DELETE ON public.saves
FOR EACH ROW EXECUTE FUNCTION public.update_video_saves_count();

UPDATE public.videos v
SET likes_count = COALESCE(s.cnt, 0)
FROM (
  SELECT video_id, COUNT(*)::integer AS cnt
  FROM public.likes
  GROUP BY video_id
) s
WHERE v.id = s.video_id;
UPDATE public.videos SET likes_count = 0 WHERE likes_count IS NULL OR id NOT IN (SELECT video_id FROM public.likes);

UPDATE public.videos v
SET comments_count = COALESCE(s.cnt, 0)
FROM (
  SELECT video_id, COUNT(*)::integer AS cnt
  FROM public.comments
  GROUP BY video_id
) s
WHERE v.id = s.video_id;
UPDATE public.videos SET comments_count = 0 WHERE comments_count IS NULL OR id NOT IN (SELECT video_id FROM public.comments);

UPDATE public.videos v
SET saves_count = COALESCE(s.cnt, 0)
FROM (
  SELECT video_id, COUNT(*)::integer AS cnt
  FROM public.saves
  GROUP BY video_id
) s
WHERE v.id = s.video_id;
UPDATE public.videos SET saves_count = 0 WHERE saves_count IS NULL OR id NOT IN (SELECT video_id FROM public.saves);

CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent_count integer;
  _other_user_id uuid;
  _is_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NEW.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _is_admin := public.has_role(NEW.sender_id, 'super_admin') OR public.has_role(NEW.sender_id, 'admin');

  IF length(coalesce(NEW.content, '')) > 1800 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT cp.user_id INTO _other_user_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
  LIMIT 1;

  IF NOT _is_admin
     AND _other_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_blocks')
     AND public.is_blocked_between(NEW.sender_id, _other_user_id) THEN
    RAISE EXCEPTION 'Message blocked';
  END IF;

  IF NOT _is_admin THEN
    SELECT COUNT(*) INTO _recent_count
    FROM public.messages m
    WHERE m.sender_id = NEW.sender_id
      AND m.created_at > now() - interval '60 seconds';

    IF _recent_count >= 18 THEN
      RAISE EXCEPTION 'Message rate limit exceeded';
    END IF;

    SELECT COUNT(*) INTO _recent_count
    FROM public.messages m
    WHERE m.sender_id = NEW.sender_id
      AND coalesce(m.content, '') = coalesce(NEW.content, '')
      AND coalesce(NEW.content, '') <> ''
      AND m.created_at > now() - interval '5 minutes';

    IF _recent_count >= 4 THEN
      RAISE EXCEPTION 'Duplicate message limit exceeded';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_message_insert_trigger ON public.messages;
CREATE TRIGGER guard_message_insert_trigger
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_insert();

CREATE OR REPLACE FUNCTION public.guard_video_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent_count integer;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.has_role(NEW.user_id, 'super_admin') OR public.has_role(NEW.user_id, 'admin') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO _recent_count
  FROM public.videos v
  WHERE v.user_id = NEW.user_id
    AND v.created_at > now() - interval '10 minutes';

  IF _recent_count >= 5 THEN
    RAISE EXCEPTION 'Post rate limit exceeded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_video_insert_trigger ON public.videos;
CREATE TRIGGER guard_video_insert_trigger
BEFORE INSERT ON public.videos
FOR EACH ROW EXECUTE FUNCTION public.guard_video_insert();

CREATE INDEX IF NOT EXISTS idx_videos_user_created ON public.videos(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_published_created ON public.videos(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_video_created ON public.comments(video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_user_created ON public.likes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saves_user_created ON public.saves(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON public.conversation_participants(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_call_sessions_recipient_status_created ON public.direct_call_sessions(recipient_id, status, created_at DESC);
