CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION private.is_conversation_participant(_conversation_id uuid, _user_id uuid)
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

CREATE OR REPLACE FUNCTION private.is_blocked_between(_a uuid, _b uuid)
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

CREATE OR REPLACE FUNCTION private.increment_video_views(_video_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.videos
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = _video_id
    AND COALESCE(is_published, true) = true;
$$;

CREATE OR REPLACE FUNCTION private.find_or_create_direct_conversation(_current_user_id uuid, _other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
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

  IF private.has_role(_current_user_id, 'admin') OR private.has_role(_current_user_id, 'super_admin')
     OR private.has_role(_other_user_id, 'admin') OR private.has_role(_other_user_id, 'super_admin') THEN
    _bypass := true;
  END IF;

  IF NOT _bypass AND private.is_blocked_between(_current_user_id, _other_user_id) THEN
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

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_conversation_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_blocked_between(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.increment_video_views(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.find_or_create_direct_conversation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_conversation_participant(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_blocked_between(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.increment_video_views(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.find_or_create_direct_conversation(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.has_role(_user_id, _role);
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.is_conversation_participant(_conversation_id, _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.is_blocked_between(_a, _b);
$$;

CREATE OR REPLACE FUNCTION public.increment_video_views(_video_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.increment_video_views(_video_id);
$$;

CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.find_or_create_direct_conversation(auth.uid(), _other_user_id);
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_video_views(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_or_create_direct_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_video_views(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_or_create_direct_conversation(uuid) TO authenticated, service_role;