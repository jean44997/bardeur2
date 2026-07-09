
-- Fix: anon users get 401 on videos feed because the videos RLS policy
-- references public.follows in an EXISTS clause but anon has no SELECT grant.
-- Wrap the follow checks in SECURITY DEFINER helpers so the policy no longer
-- requires the invoker to have direct SELECT on follows.

CREATE OR REPLACE FUNCTION public.is_follower(_follower uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _follower IS NOT NULL AND _target IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = _follower AND following_id = _target
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mutual_follow(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _a IS NOT NULL AND _b IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = _a AND following_id = _b)
     AND EXISTS (SELECT 1 FROM public.follows WHERE follower_id = _b AND following_id = _a);
$$;

GRANT EXECUTE ON FUNCTION public.is_follower(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_mutual_follow(uuid, uuid) TO anon, authenticated;

-- Rebuild the videos SELECT policy using the helpers
DROP POLICY IF EXISTS "Videos visible by owner and audience" ON public.videos;
CREATE POLICY "Videos visible by owner and audience" ON public.videos
FOR SELECT TO public
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    COALESCE(is_published, true) = true
    AND public.can_view_profile_content(auth.uid(), user_id)
    AND COALESCE(audience, 'public'::text) = 'public'
  )
  OR (
    COALESCE(is_published, true) = true
    AND COALESCE(audience, 'public'::text) = 'followers'
    AND public.is_follower(auth.uid(), videos.user_id)
  )
  OR (
    COALESCE(is_published, true) = true
    AND COALESCE(audience, 'public'::text) = 'friends'
    AND public.is_mutual_follow(auth.uid(), videos.user_id)
  )
);

-- Helpful indexes to speed message + video loads
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_published_created ON public.videos (is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
