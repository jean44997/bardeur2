CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current_user_id uuid := auth.uid();
  _conversation_id uuid;
  _bypass boolean := false;
BEGIN
  IF _current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _current_user_id = _other_user_id THEN
    RAISE EXCEPTION 'Cannot create self conversation';
  END IF;

  -- Admins / super admins peuvent contacter n'importe qui, et n'importe qui peut leur repondre
  IF public.has_role(_current_user_id, 'admin') OR public.has_role(_current_user_id, 'super_admin')
     OR public.has_role(_other_user_id, 'admin') OR public.has_role(_other_user_id, 'super_admin') THEN
    _bypass := true;
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
  WHERE c.is_group = false
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
$function$;