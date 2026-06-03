CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.stories
  WHERE expires_at <= now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_stories_active_audience_created
ON public.stories (expires_at, audience, created_at DESC);

DROP POLICY IF EXISTS "Stories visible by audience" ON public.stories;
DROP POLICY IF EXISTS "Visible public and follower stories" ON public.stories;
DROP POLICY IF EXISTS "Story owners manage stories" ON public.stories;
DROP POLICY IF EXISTS "Users insert own stories" ON public.stories;
DROP POLICY IF EXISTS "Users delete own stories" ON public.stories;

CREATE POLICY "Stories visible by audience"
ON public.stories
FOR SELECT
USING (
  expires_at > now()
  AND (
    audience = 'public'
    OR auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      audience IN ('friends', 'private', 'followers')
      AND auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.follows f1
        JOIN public.follows f2
          ON f2.follower_id = stories.user_id
         AND f2.following_id = auth.uid()
        WHERE f1.follower_id = auth.uid()
          AND f1.following_id = stories.user_id
      )
    )
  )
);

CREATE POLICY "Users insert own active stories"
ON public.stories
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND audience IN ('public', 'friends', 'private')
  AND expires_at > now()
  AND expires_at <= now() + interval '24 hours 5 minutes'
);

CREATE POLICY "Users delete own stories"
ON public.stories
FOR DELETE
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-stories-every-15-minutes') THEN
    PERFORM cron.schedule(
      'cleanup-expired-stories-every-15-minutes',
      '*/15 * * * *',
      'SELECT public.cleanup_expired_stories();'
    );
  END IF;
END;
$$;

SELECT public.cleanup_expired_stories();