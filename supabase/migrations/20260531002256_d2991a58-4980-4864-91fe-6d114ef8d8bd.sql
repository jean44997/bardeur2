CREATE OR REPLACE FUNCTION public.send_admin_official_message(_recipient_id uuid, _content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
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
  IF length(COALESCE(_content, '')) = 0 OR length(_content) > 1500 THEN RAISE EXCEPTION 'Invalid message length'; END IF;

  -- Pick first super_admin as the official sender, preferring one different from the recipient
  SELECT user_id INTO _official_id
    FROM public.user_roles
    WHERE role = 'super_admin' AND user_id <> _recipient_id
    ORDER BY created_at ASC
    LIMIT 1;

  IF _official_id IS NULL THEN
    SELECT user_id INTO _official_id
      FROM public.user_roles
      WHERE role = 'super_admin'
      ORDER BY created_at ASC
      LIMIT 1;
  END IF;

  IF _official_id IS NULL THEN _official_id := auth.uid(); END IF;

  -- Silently skip when the recipient is the official account itself (broadcast to self)
  IF _official_id = _recipient_id THEN RETURN NULL; END IF;

  _conversation_id := private.find_or_create_direct_conversation(_official_id, _recipient_id);

  INSERT INTO public.messages (conversation_id, sender_id, content, content_version)
  VALUES (_conversation_id, _official_id, _content, 'plain')
  RETURNING id INTO _message_id;

  RETURN _message_id;
END;
$function$;