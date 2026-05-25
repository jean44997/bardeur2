-- PWA/mobile hardening: blocks, message encryption metadata, server-side rate limits and granular notification opt-outs.

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS encrypted_content BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS content_version TEXT NOT NULL DEFAULT 'plain';

ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_likes BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_comments BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_follows BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_shares BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_mentions BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_sound TEXT NOT NULL DEFAULT 'pop',
ADD COLUMN IF NOT EXISTS notification_quiet_hours_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_quiet_hours_start TIME NOT NULL DEFAULT '22:00',
ADD COLUMN IF NOT EXISTS notification_quiet_hours_end TIME NOT NULL DEFAULT '08:00';

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_unique_pair_idx ON public.user_blocks(blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id, blocker_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_message_id ON public.reports(message_id);

DROP POLICY IF EXISTS "Users can view own block edges" ON public.user_blocks;
CREATE POLICY "Users can view own block edges"
ON public.user_blocks
FOR SELECT
USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS "Users can block accounts" ON public.user_blocks;
CREATE POLICY "Users can block accounts"
ON public.user_blocks
FOR INSERT
WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock accounts" ON public.user_blocks;
CREATE POLICY "Users can unblock accounts"
ON public.user_blocks
FOR DELETE
USING (auth.uid() = blocker_id);

CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks ub
    WHERE (ub.blocker_id = _a AND ub.blocked_id = _b)
       OR (ub.blocker_id = _b AND ub.blocked_id = _a)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.profile_allows_notification(_user_id uuid, _type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.push_notifications, true)
    AND CASE
      WHEN _type = 'like' THEN COALESCE(p.notify_likes, true)
      WHEN _type = 'comment' THEN COALESCE(p.notify_comments, true)
      WHEN _type = 'follow' THEN COALESCE(p.notify_follows, true)
      WHEN _type = 'message' THEN COALESCE(p.notify_messages, true)
      WHEN _type = 'share' THEN COALESCE(p.notify_shares, true)
      WHEN _type = 'mention' THEN COALESCE(p.notify_mentions, true)
      ELSE true
    END
  FROM public.profiles p
  WHERE p.id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.profile_allows_notification(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent_count integer;
  _other_user_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NEW.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF length(coalesce(NEW.content, '')) > 1800 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT cp.user_id INTO _other_user_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
  LIMIT 1;

  IF _other_user_id IS NOT NULL AND public.is_blocked_between(NEW.sender_id, _other_user_id) THEN
    RAISE EXCEPTION 'Message blocked';
  END IF;

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_message_insert_trigger ON public.messages;
CREATE TRIGGER guard_message_insert_trigger
BEFORE INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.guard_message_insert();

CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.follower_id <> NEW.following_id
     AND NOT public.is_blocked_between(NEW.follower_id, NEW.following_id)
     AND public.profile_allows_notification(NEW.following_id, 'follow') THEN
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
  IF _owner_id IS NOT NULL
     AND _owner_id <> NEW.user_id
     AND NOT public.is_blocked_between(NEW.user_id, _owner_id)
     AND public.profile_allows_notification(_owner_id, 'like') THEN
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
  IF _owner_id IS NOT NULL
     AND _owner_id <> NEW.user_id
     AND NOT public.is_blocked_between(NEW.user_id, _owner_id)
     AND public.profile_allows_notification(_owner_id, 'comment') THEN
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
    AND cp.user_id <> NEW.sender_id
    AND NOT public.is_blocked_between(NEW.sender_id, cp.user_id)
    AND public.profile_allows_notification(cp.user_id, 'message');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_share_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_blocked_between(NEW.sender_id, NEW.recipient_id)
     AND public.profile_allows_notification(NEW.recipient_id, 'share') THEN
    INSERT INTO public.notifications (user_id, from_user_id, type, content, reference_id)
    VALUES (NEW.recipient_id, NEW.sender_id, 'share', 't’a partagé un contenu', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages"
ON public.messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
