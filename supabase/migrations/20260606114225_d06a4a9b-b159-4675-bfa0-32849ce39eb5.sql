
-- 1) is_user_banned ownership guard
CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid)
RETURNS TABLE(banned boolean, reason text, expires_at timestamptz, is_permanent boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT true, COALESCE(b.reason,'Compte suspendu'), b.expires_at, b.is_permanent
  FROM public.banned_users b
  WHERE b.user_id = _user_id
    AND (_user_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'super_admin'))
    AND (b.is_permanent OR b.expires_at IS NULL OR b.expires_at > now())
  ORDER BY b.created_at DESC LIMIT 1;
$$;

-- 2) Notifications: prevent client-side inserts (triggers only)
DROP POLICY IF EXISTS "Users can create notifications they originate" ON public.notifications;
REVOKE INSERT ON public.notifications FROM anon, authenticated;

-- 3) Profiles: restrict anon to safe public columns only
DROP POLICY IF EXISTS "Profiles public columns readable" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, username, display_name, bio, avatar_url, website,
  is_private, thought_of_day, thought_updated_at,
  xp_total, created_at, updated_at
) ON public.profiles TO anon;
CREATE POLICY "Profiles public columns readable"
  ON public.profiles FOR SELECT TO anon
  USING (true);

-- 4) Storage: require uploads under uploader's own folder
DROP POLICY IF EXISTS "Authenticated can upload media" ON storage.objects;
CREATE POLICY "Authenticated can upload media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('media','avatars')
    AND auth.uid() IS NOT NULL
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 5) Stories audience: split private/followers/friends
DROP POLICY IF EXISTS "Stories visible by audience" ON public.stories;
CREATE POLICY "Stories visible by audience"
  ON public.stories FOR SELECT
  USING (
    expires_at > now() AND (
      auth.uid() = user_id
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'super_admin')
      OR audience = 'public'
      OR (
        audience = 'followers'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE f.follower_id = auth.uid() AND f.following_id = stories.user_id
        )
      )
      OR (
        audience = 'friends'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.follows f1
          JOIN public.follows f2
            ON f2.follower_id = stories.user_id AND f2.following_id = auth.uid()
          WHERE f1.follower_id = auth.uid() AND f1.following_id = stories.user_id
        )
      )
      -- audience = 'private' restricted to owner (covered by first branch)
    )
  );
