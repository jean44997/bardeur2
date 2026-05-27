ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS encrypted_content boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_version text NOT NULL DEFAULT 'plain';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hide_following boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_profile_views boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_likes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_comments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_follows boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_shares boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_mentions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_sound text NOT NULL DEFAULT 'pop',
  ADD COLUMN IF NOT EXISTS notification_quiet_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_quiet_hours_start time NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS notification_quiet_hours_end time NOT NULL DEFAULT '08:00';

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS allow_downloads boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_duet boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_stitch boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_captions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promote_after_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_disclosure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_tag text,
  ADD COLUMN IF NOT EXISTS cover_note text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS create_options jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.lives
  ADD COLUMN IF NOT EXISTS quality_profile text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS stream_health text NOT NULL DEFAULT 'starting',
  ADD COLUMN IF NOT EXISTS last_frame_at timestamptz;

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

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

CREATE TABLE IF NOT EXISTS public.chat_preferences (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  background text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_preferences TO authenticated;
GRANT ALL ON public.chat_preferences TO service_role;
ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.direct_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_type text NOT NULL CHECK (call_type IN ('audio', 'video')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'connected', 'missed', 'declined', 'ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_call_sessions TO authenticated;
GRANT ALL ON public.direct_call_sessions TO service_role;
ALTER TABLE public.direct_call_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.direct_call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.direct_call_sessions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('offer', 'answer', 'candidate')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.direct_call_signals TO authenticated;
GRANT ALL ON public.direct_call_signals TO service_role;
ALTER TABLE public.direct_call_signals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_streaks (
  conversation_id uuid PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  streak_count integer NOT NULL DEFAULT 0,
  last_message_date date,
  points_total integer NOT NULL DEFAULT 0,
  reward_tier text NOT NULL DEFAULT 'spark',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a <> user_b)
);
GRANT SELECT ON public.chat_streaks TO authenticated;
GRANT ALL ON public.chat_streaks TO service_role;
ALTER TABLE public.chat_streaks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.flame_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 1 CHECK (points BETWEEN 1 AND 100),
  reason text NOT NULL DEFAULT 'message',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.flame_events TO authenticated;
GRANT ALL ON public.flame_events TO service_role;
ALTER TABLE public.flame_events ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_unique_pair_idx ON public.user_blocks(blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_id, blocker_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON public.conversation_participants(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_direct_call_sessions_conversation_created ON public.direct_call_sessions(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_call_sessions_recipient_status_created ON public.direct_call_sessions(recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_call_signals_call_created ON public.direct_call_signals(call_id, created_at);
CREATE INDEX IF NOT EXISTS idx_direct_call_signals_recipient_created ON public.direct_call_signals(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flame_events_conversation_created ON public.flame_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flame_events_sender_recent ON public.flame_events(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lives_active_started_health ON public.lives(is_active, started_at DESC, stream_health);
CREATE INDEX IF NOT EXISTS idx_live_messages_user_created ON public.live_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_audience_published_created ON public.videos(audience, is_published, created_at DESC);

DROP POLICY IF EXISTS "Users can view own block edges" ON public.user_blocks;
CREATE POLICY "Users can view own block edges"
ON public.user_blocks
FOR SELECT
TO authenticated
USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS "Users can block accounts" ON public.user_blocks;
CREATE POLICY "Users can block accounts"
ON public.user_blocks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can unblock accounts" ON public.user_blocks;
CREATE POLICY "Users can unblock accounts"
ON public.user_blocks
FOR DELETE
TO authenticated
USING (auth.uid() = blocker_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Users manage their own chat preferences" ON public.chat_preferences;
CREATE POLICY "Users manage their own chat preferences"
ON public.chat_preferences
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  AND public.is_conversation_participant(conversation_id, auth.uid())
)
WITH CHECK (
  auth.uid() = user_id
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Direct call participants can read calls" ON public.direct_call_sessions;
CREATE POLICY "Direct call participants can read calls"
ON public.direct_call_sessions
FOR SELECT
TO authenticated
USING (
  auth.uid() IN (caller_id, recipient_id)
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Direct call callers can create calls" ON public.direct_call_sessions;
CREATE POLICY "Direct call callers can create calls"
ON public.direct_call_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = caller_id
  AND caller_id <> recipient_id
  AND public.is_conversation_participant(conversation_id, auth.uid())
  AND NOT public.is_blocked_between(caller_id, recipient_id)
);

DROP POLICY IF EXISTS "Direct call participants can update calls" ON public.direct_call_sessions;
CREATE POLICY "Direct call participants can update calls"
ON public.direct_call_sessions
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (caller_id, recipient_id)
  AND public.is_conversation_participant(conversation_id, auth.uid())
)
WITH CHECK (
  auth.uid() IN (caller_id, recipient_id)
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Direct call users read signals" ON public.direct_call_signals;
CREATE POLICY "Direct call users read signals"
ON public.direct_call_signals
FOR SELECT
TO authenticated
USING (
  auth.uid() IN (sender_id, recipient_id)
  AND EXISTS (
    SELECT 1 FROM public.direct_call_sessions d
    WHERE d.id = direct_call_signals.call_id
      AND auth.uid() IN (d.caller_id, d.recipient_id)
  )
);

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
    WHERE d.id = call_id
      AND auth.uid() IN (d.caller_id, d.recipient_id)
      AND recipient_id IN (d.caller_id, d.recipient_id)
      AND public.is_conversation_participant(d.conversation_id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Conversation participants can read streaks" ON public.chat_streaks;
CREATE POLICY "Conversation participants can read streaks"
ON public.chat_streaks
FOR SELECT
TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Conversation users read flame events" ON public.flame_events;
CREATE POLICY "Conversation users read flame events"
ON public.flame_events
FOR SELECT
TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Users create own flame events" ON public.flame_events;
CREATE POLICY "Users create own flame events"
ON public.flame_events
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS "Videos visible by owner and audience" ON public.videos;
DROP POLICY IF EXISTS "Published videos are viewable by allowed viewers" ON public.videos;
CREATE POLICY "Videos visible by owner and audience"
ON public.videos
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR (
    COALESCE(is_published, true) = true
    AND public.can_view_profile_content(auth.uid(), user_id)
    AND COALESCE(audience, 'public') = 'public'
  )
  OR (
    COALESCE(is_published, true) = true
    AND COALESCE(audience, 'public') = 'followers'
    AND EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.following_id = videos.user_id
        AND f.follower_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
DROP POLICY IF EXISTS "Conversation participants can mark messages read" ON public.messages;
CREATE POLICY "Conversation participants can mark messages read"
ON public.messages
FOR UPDATE
TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()))
WITH CHECK (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_user_id uuid := auth.uid();
  _conversation_id uuid;
  _bypass boolean := false;
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

  IF public.has_role(_current_user_id, 'admin') OR public.has_role(_current_user_id, 'super_admin')
     OR public.has_role(_other_user_id, 'admin') OR public.has_role(_other_user_id, 'super_admin') THEN
    _bypass := true;
  END IF;

  IF NOT _bypass AND public.is_blocked_between(_current_user_id, _other_user_id) THEN
    RAISE EXCEPTION 'Conversation blocked';
  END IF;

  IF NOT _bypass THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.follows f1
      WHERE f1.follower_id = _current_user_id AND f1.following_id = _other_user_id
    ) OR NOT EXISTS (
      SELECT 1 FROM public.follows f2
      WHERE f2.follower_id = _other_user_id AND f2.following_id = _current_user_id
    ) THEN
      RAISE EXCEPTION 'Mutual follow required';
    END IF;
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
  _other_is_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NEW.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF length(COALESCE(NEW.content, '')) > 1800 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  SELECT cp.user_id INTO _other_user_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
  LIMIT 1;

  _is_admin := public.has_role(NEW.sender_id, 'super_admin') OR public.has_role(NEW.sender_id, 'admin');
  _other_is_admin := _other_user_id IS NOT NULL AND (public.has_role(_other_user_id, 'super_admin') OR public.has_role(_other_user_id, 'admin'));

  IF NOT _is_admin AND NOT _other_is_admin
     AND _other_user_id IS NOT NULL
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
      AND COALESCE(m.content, '') = COALESCE(NEW.content, '')
      AND COALESCE(NEW.content, '') <> ''
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

CREATE OR REPLACE FUNCTION public.touch_chat_streak()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_ids uuid[];
  a uuid;
  b uuid;
  previous_date date;
  previous_count integer;
  today date := current_date;
BEGIN
  SELECT array_agg(user_id ORDER BY user_id)
    INTO participant_ids
  FROM public.conversation_participants
  WHERE conversation_id = NEW.conversation_id;

  IF array_length(participant_ids, 1) < 2 THEN
    RETURN NEW;
  END IF;

  a := participant_ids[1];
  b := participant_ids[2];

  SELECT last_message_date, streak_count
    INTO previous_date, previous_count
  FROM public.chat_streaks
  WHERE conversation_id = NEW.conversation_id
  FOR UPDATE;

  INSERT INTO public.chat_streaks (conversation_id, user_a, user_b, streak_count, last_message_date, updated_at)
  VALUES (
    NEW.conversation_id,
    a,
    b,
    CASE
      WHEN previous_date = today THEN COALESCE(previous_count, 1)
      WHEN previous_date = today - 1 THEN COALESCE(previous_count, 0) + 1
      ELSE 1
    END,
    today,
    now()
  )
  ON CONFLICT (conversation_id) DO UPDATE
    SET streak_count = EXCLUDED.streak_count,
        last_message_date = EXCLUDED.last_message_date,
        updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_chat_streak_on_message ON public.messages;
CREATE TRIGGER touch_chat_streak_on_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_chat_streak();

CREATE OR REPLACE FUNCTION public.record_flame_event_for_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recipient_id uuid;
  _recent_count integer;
  _points integer;
BEGIN
  SELECT cp.user_id INTO _recipient_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id
  LIMIT 1;

  IF _recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO _recent_count
  FROM public.flame_events fe
  WHERE fe.conversation_id = NEW.conversation_id
    AND fe.sender_id = NEW.sender_id
    AND fe.created_at > now() - interval '10 minutes';

  IF _recent_count < 3 THEN
    _points := CASE WHEN COALESCE(NEW.media_type, '') LIKE 'audio/%' THEN 3 ELSE 1 END;
    INSERT INTO public.flame_events (conversation_id, sender_id, recipient_id, points, reason)
    VALUES (
      NEW.conversation_id,
      NEW.sender_id,
      _recipient_id,
      _points,
      CASE WHEN COALESCE(NEW.media_type, '') LIKE 'audio/%' THEN 'voice_reply' ELSE 'message_reply' END
    );

    UPDATE public.chat_streaks cs
    SET points_total = GREATEST(0, COALESCE(cs.points_total, 0)) + _points,
        reward_tier = CASE
          WHEN GREATEST(0, COALESCE(cs.points_total, 0)) + _points >= 150 THEN 'vip'
          WHEN GREATEST(0, COALESCE(cs.points_total, 0)) + _points >= 70 THEN 'super'
          WHEN GREATEST(0, COALESCE(cs.points_total, 0)) + _points >= 25 THEN 'solid'
          ELSE 'spark'
        END,
        updated_at = now()
    WHERE cs.conversation_id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_flame_event_on_message ON public.messages;
CREATE TRIGGER record_flame_event_on_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.record_flame_event_for_message();

CREATE OR REPLACE FUNCTION public.guard_live_message_insert()
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

  IF length(COALESCE(NEW.content, '')) > 500 THEN
    RAISE EXCEPTION 'Live message too long';
  END IF;

  IF public.has_role(NEW.user_id, 'admin') OR public.has_role(NEW.user_id, 'super_admin') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO _recent_count
  FROM public.live_messages lm
  WHERE lm.user_id = NEW.user_id
    AND lm.created_at > now() - interval '30 seconds';

  IF _recent_count >= 8 THEN
    RAISE EXCEPTION 'Live chat rate limit exceeded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_live_message_insert_trigger ON public.live_messages;
CREATE TRIGGER guard_live_message_insert_trigger
BEFORE INSERT ON public.live_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_live_message_insert();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_call_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_call_signals;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_preferences;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_streaks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.flame_events;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;