-- Fix data relationships so embedded profile queries work with public schema
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS videos_user_id_fkey;
ALTER TABLE public.videos ADD CONSTRAINT videos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_from_user_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.conversation_participants DROP CONSTRAINT IF EXISTS conversation_participants_user_id_fkey;
ALTER TABLE public.conversation_participants ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_follower_id_fkey;
ALTER TABLE public.follows ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_following_id_fkey;
ALTER TABLE public.follows ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.likes DROP CONSTRAINT IF EXISTS likes_user_id_fkey;
ALTER TABLE public.likes ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.saves DROP CONSTRAINT IF EXISTS saves_user_id_fkey;
ALTER TABLE public.saves ADD CONSTRAINT saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.shares DROP CONSTRAINT IF EXISTS shares_user_id_fkey;
ALTER TABLE public.shares ADD CONSTRAINT shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.comment_likes DROP CONSTRAINT IF EXISTS comment_likes_user_id_fkey;
ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey;
ALTER TABLE public.reports ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reported_user_id_fkey;
ALTER TABLE public.reports ADD CONSTRAINT reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.banned_users DROP CONSTRAINT IF EXISTS banned_users_user_id_fkey;
ALTER TABLE public.banned_users ADD CONSTRAINT banned_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.banned_users DROP CONSTRAINT IF EXISTS banned_users_banned_by_fkey;
ALTER TABLE public.banned_users ADD CONSTRAINT banned_users_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Prevent duplicates on social actions
CREATE UNIQUE INDEX IF NOT EXISTS follows_unique_pair_idx ON public.follows (follower_id, following_id);
CREATE UNIQUE INDEX IF NOT EXISTS likes_unique_pair_idx ON public.likes (user_id, video_id);
CREATE UNIQUE INDEX IF NOT EXISTS saves_unique_pair_idx ON public.saves (user_id, video_id);
CREATE UNIQUE INDEX IF NOT EXISTS comment_likes_unique_pair_idx ON public.comment_likes (user_id, comment_id);

-- Reliable participant checks for RLS and messaging
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = _conversation_id
      AND cp.user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Participants can view" ON public.conversation_participants;
CREATE POLICY "Participants can view"
ON public.conversation_participants
FOR SELECT
USING (
  auth.uid() = user_id OR public.is_conversation_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
CREATE POLICY "Participants can view conversations"
ON public.conversations
FOR SELECT
USING (public.is_conversation_participant(id, auth.uid()));

DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id AND public.is_conversation_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
CREATE POLICY "Participants can view messages"
ON public.messages
FOR SELECT
USING (public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Users can update own messages"
ON public.messages
FOR UPDATE
USING (
  auth.uid() = sender_id OR public.is_conversation_participant(conversation_id, auth.uid())
);

-- Create or reuse a direct conversation only for mutual follows
CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_user_id uuid := auth.uid();
  _conversation_id uuid;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _current_user_id = _other_user_id THEN
    RAISE EXCEPTION 'Cannot create self conversation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.follows f1
    WHERE f1.follower_id = _current_user_id AND f1.following_id = _other_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.follows f2
    WHERE f2.follower_id = _other_user_id AND f2.following_id = _current_user_id
  ) THEN
    RAISE EXCEPTION 'Mutual follow required';
  END IF;

  SELECT c.id INTO _conversation_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = _current_user_id
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = _other_user_id
  WHERE c.is_group = false
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

-- Real counters and views
CREATE OR REPLACE FUNCTION public.increment_video_views(_video_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.videos
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = _video_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_video_views(uuid) TO anon, authenticated;

DROP TRIGGER IF EXISTS likes_count_trigger ON public.likes;
CREATE TRIGGER likes_count_trigger
AFTER INSERT OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.update_video_likes_count();

DROP TRIGGER IF EXISTS comments_count_trigger ON public.comments;
CREATE TRIGGER comments_count_trigger
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.update_video_comments_count();

DROP TRIGGER IF EXISTS saves_count_trigger ON public.saves;
CREATE TRIGGER saves_count_trigger
AFTER INSERT OR DELETE ON public.saves
FOR EACH ROW EXECUTE FUNCTION public.update_video_saves_count();

-- Real notifications for follows, likes, comments, and messages
CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.follower_id <> NEW.following_id THEN
    INSERT INTO public.notifications (user_id, from_user_id, type, content, reference_id)
    VALUES (NEW.following_id, NEW.follower_id, 'follow', 'a commencé à te suivre', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid;
BEGIN
  SELECT v.user_id INTO _owner_id FROM public.videos v WHERE v.id = NEW.video_id;
  IF _owner_id IS NOT NULL AND _owner_id <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, from_user_id, type, content, reference_id)
    VALUES (_owner_id, NEW.user_id, 'like', 'a aimé ta vidéo', NEW.video_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_comment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid;
BEGIN
  SELECT v.user_id INTO _owner_id FROM public.videos v WHERE v.id = NEW.video_id;
  IF _owner_id IS NOT NULL AND _owner_id <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, from_user_id, type, content, reference_id)
    VALUES (_owner_id, NEW.user_id, 'comment', 'a commenté ta vidéo', NEW.video_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, from_user_id, type, content, reference_id)
  SELECT cp.user_id, NEW.sender_id, 'message', 't’a envoyé un message', NEW.conversation_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follow_notification_trigger ON public.follows;
CREATE TRIGGER follow_notification_trigger
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.create_follow_notification();

DROP TRIGGER IF EXISTS like_notification_trigger ON public.likes;
CREATE TRIGGER like_notification_trigger
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.create_like_notification();

DROP TRIGGER IF EXISTS comment_notification_trigger ON public.comments;
CREATE TRIGGER comment_notification_trigger
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.create_comment_notification();

DROP TRIGGER IF EXISTS message_notification_trigger ON public.messages;
CREATE TRIGGER message_notification_trigger
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.create_message_notification();

-- Re-sync existing counters from real data
UPDATE public.videos v
SET likes_count = COALESCE(s.cnt, 0)
FROM (
  SELECT video_id, COUNT(*)::int AS cnt
  FROM public.likes
  GROUP BY video_id
) s
WHERE v.id = s.video_id;

UPDATE public.videos
SET likes_count = 0
WHERE likes_count IS NULL OR id NOT IN (SELECT video_id FROM public.likes);

UPDATE public.videos v
SET comments_count = COALESCE(s.cnt, 0)
FROM (
  SELECT video_id, COUNT(*)::int AS cnt
  FROM public.comments
  GROUP BY video_id
) s
WHERE v.id = s.video_id;

UPDATE public.videos
SET comments_count = 0
WHERE comments_count IS NULL OR id NOT IN (SELECT video_id FROM public.comments);

UPDATE public.videos v
SET saves_count = COALESCE(s.cnt, 0)
FROM (
  SELECT video_id, COUNT(*)::int AS cnt
  FROM public.saves
  GROUP BY video_id
) s
WHERE v.id = s.video_id;

UPDATE public.videos
SET saves_count = 0
WHERE saves_count IS NULL OR id NOT IN (SELECT video_id FROM public.saves);