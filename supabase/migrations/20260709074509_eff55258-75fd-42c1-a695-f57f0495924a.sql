
-- 1) Restrict anon column access on profiles (RLS cannot filter columns; use column privileges)
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, username, display_name, bio, avatar_url, website, is_private,
  xp_total, thought_of_day, thought_updated_at, created_at
) ON public.profiles TO anon;

-- 2) Stories INSERT: allow 'followers' audience
DROP POLICY IF EXISTS "Users insert own active stories" ON public.stories;
CREATE POLICY "Users insert own active stories" ON public.stories
FOR INSERT TO public
WITH CHECK (
  auth.uid() = user_id
  AND audience = ANY (ARRAY['public','followers','friends','private'])
  AND expires_at > now()
  AND expires_at <= (now() + interval '24 hours 30 minutes')
);

-- 3) Videos SELECT: enforce mutual-follow for 'friends' audience
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
    AND EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.following_id = videos.user_id AND f.follower_id = auth.uid()
    )
  )
  OR (
    COALESCE(is_published, true) = true
    AND COALESCE(audience, 'public'::text) = 'friends'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.follows f1
      JOIN public.follows f2
        ON f2.follower_id = videos.user_id
       AND f2.following_id = auth.uid()
      WHERE f1.follower_id = auth.uid()
        AND f1.following_id = videos.user_id
    )
  )
);
