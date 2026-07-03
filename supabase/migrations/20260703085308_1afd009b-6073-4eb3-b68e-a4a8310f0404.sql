
-- Group conversation RPCs (atomic create, add members, delete)

CREATE OR REPLACE FUNCTION public.create_group_conversation_atomic(_group_name text, _member_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _creator uuid := auth.uid();
  _conv_id uuid;
  _clean_name text;
  _member uuid;
  _valid_members uuid[];
BEGIN
  IF _creator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _clean_name := NULLIF(btrim(COALESCE(_group_name, '')), '');
  IF _clean_name IS NULL THEN _clean_name := 'Groupe amis'; END IF;
  IF length(_clean_name) > 80 THEN _clean_name := substr(_clean_name, 1, 80); END IF;

  -- Deduplicate + drop creator + nulls
  SELECT COALESCE(array_agg(DISTINCT m), ARRAY[]::uuid[])
    INTO _valid_members
  FROM unnest(COALESCE(_member_ids, ARRAY[]::uuid[])) AS m
  WHERE m IS NOT NULL AND m <> _creator;

  IF array_length(_valid_members, 1) IS NULL OR array_length(_valid_members, 1) < 2 THEN
    RAISE EXCEPTION 'Groupe requiert au moins 3 membres';
  END IF;
  IF array_length(_valid_members, 1) > 9 THEN
    RAISE EXCEPTION 'Groupe limite a 10 membres';
  END IF;

  INSERT INTO public.conversations (is_group, group_name)
  VALUES (true, _clean_name)
  RETURNING id INTO _conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (_conv_id, _creator);

  FOREACH _member IN ARRAY _valid_members LOOP
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (_conv_id, _member)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN _conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_conversation_atomic(text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation_atomic(text, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_friend_group_members(_conversation_id uuid, _member_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_group boolean;
  _is_member boolean;
  _current_count integer;
  _added integer := 0;
  _member uuid;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT c.is_group INTO _is_group FROM public.conversations c WHERE c.id = _conversation_id;
  IF NOT COALESCE(_is_group, false) THEN RAISE EXCEPTION 'Not a group conversation'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _caller
  ) INTO _is_member;
  IF NOT _is_member THEN RAISE EXCEPTION 'Not a group member'; END IF;

  SELECT COUNT(*) INTO _current_count
  FROM public.conversation_participants WHERE conversation_id = _conversation_id;

  FOREACH _member IN ARRAY COALESCE(_member_ids, ARRAY[]::uuid[]) LOOP
    IF _member IS NULL OR _member = _caller THEN CONTINUE; END IF;
    IF _current_count + _added >= 10 THEN EXIT; END IF;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (_conversation_id, _member)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN _added := _added + 1; END IF;
  END LOOP;

  RETURN _added;
END;
$$;

REVOKE ALL ON FUNCTION public.add_friend_group_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_friend_group_members(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_friend_group_conversation(_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_group boolean;
  _is_member boolean;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT c.is_group INTO _is_group FROM public.conversations c WHERE c.id = _conversation_id;
  IF NOT COALESCE(_is_group, false) THEN RAISE EXCEPTION 'Not a group conversation'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _caller
  ) INTO _is_member;
  IF NOT _is_member AND NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'super_admin')) THEN
    RAISE EXCEPTION 'Not a group member';
  END IF;

  DELETE FROM public.messages WHERE conversation_id = _conversation_id;
  DELETE FROM public.conversation_participants WHERE conversation_id = _conversation_id;
  DELETE FROM public.conversations WHERE id = _conversation_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_friend_group_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_friend_group_conversation(uuid) TO authenticated;
