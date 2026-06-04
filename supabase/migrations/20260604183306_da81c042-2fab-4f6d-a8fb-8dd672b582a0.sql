
-- 1) Stories: relax RLS bound to absorb client/server clock skew (was 24:05, now 24:30)
DROP POLICY IF EXISTS "Users insert own active stories" ON public.stories;
CREATE POLICY "Users insert own active stories" ON public.stories
FOR INSERT TO public
WITH CHECK (
  auth.uid() = user_id
  AND audience = ANY (ARRAY['public'::text, 'friends'::text, 'private'::text])
  AND expires_at > now()
  AND expires_at <= (now() + interval '24 hours 30 minutes')
);

-- 2) Banned users: temp ban support
ALTER TABLE public.banned_users
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_permanent boolean NOT NULL DEFAULT true;

-- 3) Helper to check if a user is currently banned (handles expired temp bans)
CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid)
RETURNS TABLE(banned boolean, reason text, expires_at timestamptz, is_permanent boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    true,
    COALESCE(b.reason, 'Compte suspendu'),
    b.expires_at,
    b.is_permanent
  FROM public.banned_users b
  WHERE b.user_id = _user_id
    AND (b.is_permanent = true OR b.expires_at IS NULL OR b.expires_at > now())
  ORDER BY b.created_at DESC
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated;

-- 4) Onboarding completion flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- 5) Admin official message: extend to support media attachments
CREATE OR REPLACE FUNCTION public.send_admin_official_message(
  _recipient_id uuid,
  _content text,
  _media_url text DEFAULT NULL,
  _media_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
DECLARE
  _is_admin boolean;
  _official_id uuid;
  _conversation_id uuid;
  _message_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _is_admin := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin');
  IF NOT _is_admin THEN RAISE EXCEPTION 'Forbidden: admin only'; END IF;
  IF length(COALESCE(_content, '')) > 1500 THEN RAISE EXCEPTION 'Invalid message length'; END IF;
  IF COALESCE(_content, '') = '' AND COALESCE(_media_url, '') = '' THEN
    RAISE EXCEPTION 'Empty message';
  END IF;

  SELECT user_id INTO _official_id
    FROM public.user_roles
    WHERE role = 'super_admin' AND user_id <> _recipient_id
    ORDER BY created_at ASC LIMIT 1;
  IF _official_id IS NULL THEN
    SELECT user_id INTO _official_id FROM public.user_roles
      WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF _official_id IS NULL THEN _official_id := auth.uid(); END IF;
  IF _official_id = _recipient_id THEN RETURN NULL; END IF;

  _conversation_id := private.find_or_create_direct_conversation(_official_id, _recipient_id);

  INSERT INTO public.messages (conversation_id, sender_id, content, content_version, media_url, media_type)
  VALUES (_conversation_id, _official_id, COALESCE(_content, ''), 'plain', COALESCE(_media_url, ''), COALESCE(_media_type, ''))
  RETURNING id INTO _message_id;

  RETURN _message_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.send_admin_official_message(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_admin_official_message(uuid, text, text, text) TO authenticated;
