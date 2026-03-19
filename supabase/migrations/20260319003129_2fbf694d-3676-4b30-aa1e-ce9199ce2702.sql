-- Real privacy rules for public/private accounts
CREATE OR REPLACE FUNCTION public.can_view_profile_content(_viewer_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _owner_id
      AND (
        COALESCE(p.is_private, false) = false
        OR _viewer_id = _owner_id
        OR EXISTS (
          SELECT 1
          FROM public.follows f
          WHERE f.follower_id = _viewer_id
            AND f.following_id = _owner_id
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Published videos are viewable by everyone" ON public.videos;
CREATE POLICY "Published videos are viewable by allowed viewers"
ON public.videos
FOR SELECT
USING (
  is_published = true
  AND public.can_view_profile_content(auth.uid(), user_id)
);

-- Comments can be turned on/off per post
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true;

-- Realtime tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
  END IF;
END $$;