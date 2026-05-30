CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image/jpeg',
  audience text NOT NULL DEFAULT 'public',
  caption text DEFAULT '',
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_stories_user_active ON public.stories(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON public.stories(expires_at DESC);

GRANT SELECT ON public.stories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories visible by audience"
  ON public.stories FOR SELECT
  USING (
    expires_at > now() AND (
      audience = 'public'
      OR auth.uid() = user_id
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR (
        audience = 'private' AND auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE f.follower_id = auth.uid() AND f.following_id = stories.user_id
        )
      )
    )
  );

CREATE POLICY "Users insert own stories"
  ON public.stories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own stories"
  ON public.stories FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.story_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, viewer_id)
);

GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story owners and viewers can read story views"
  ON public.story_views FOR SELECT
  USING (
    auth.uid() = viewer_id
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Authenticated can record story view"
  ON public.story_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS thought_of_day text DEFAULT '',
  ADD COLUMN IF NOT EXISTS thought_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_thought_of_day(_thought text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(COALESCE(_thought, '')) > 280 THEN RAISE EXCEPTION 'Pensee trop longue'; END IF;
  UPDATE public.profiles
    SET thought_of_day = COALESCE(_thought, ''),
        thought_updated_at = now()
    WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_thought_of_day(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_admin_official_message(_recipient_id uuid, _content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _is_admin boolean;
  _official_id uuid;
  _conversation_id uuid;
  _message_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _is_admin := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin');
  IF NOT _is_admin THEN RAISE EXCEPTION 'Forbidden: admin only'; END IF;
  IF length(COALESCE(_content, '')) = 0 OR length(_content) > 1500 THEN RAISE EXCEPTION 'Invalid message length'; END IF;

  SELECT user_id INTO _official_id
    FROM public.user_roles
    WHERE role = 'super_admin'
    ORDER BY created_at ASC
    LIMIT 1;

  IF _official_id IS NULL THEN _official_id := auth.uid(); END IF;
  IF _official_id = _recipient_id THEN RAISE EXCEPTION 'Cannot message official from itself'; END IF;

  _conversation_id := private.find_or_create_direct_conversation(_official_id, _recipient_id);

  INSERT INTO public.messages (conversation_id, sender_id, content, content_version)
  VALUES (_conversation_id, _official_id, _content, 'plain')
  RETURNING id INTO _message_id;

  RETURN _message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_admin_official_message(uuid, text) TO authenticated;