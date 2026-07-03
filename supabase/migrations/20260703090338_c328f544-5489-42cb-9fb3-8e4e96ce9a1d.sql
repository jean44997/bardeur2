
-- Group call infrastructure + per-user quality memorization

CREATE TABLE IF NOT EXISTS public.group_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  host_id uuid NOT NULL,
  call_type text NOT NULL DEFAULT 'audio' CHECK (call_type IN ('audio','video')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','missed')),
  preferred_quality text NOT NULL DEFAULT 'auto' CHECK (preferred_quality IN ('eco','auto','hd','fhd')),
  quality_locked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_call_sessions TO authenticated;
GRANT ALL ON public.group_call_sessions TO service_role;
ALTER TABLE public.group_call_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gcs_select ON public.group_call_sessions;
CREATE POLICY gcs_select ON public.group_call_sessions FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS gcs_insert ON public.group_call_sessions;
CREATE POLICY gcs_insert ON public.group_call_sessions FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid() AND public.is_conversation_participant(conversation_id, auth.uid()));
DROP POLICY IF EXISTS gcs_update ON public.group_call_sessions;
CREATE POLICY gcs_update ON public.group_call_sessions FOR UPDATE TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()))
  WITH CHECK (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.group_call_participants (
  session_id uuid NOT NULL REFERENCES public.group_call_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  latency_ms integer NOT NULL DEFAULT 0,
  bitrate_kbps integer NOT NULL DEFAULT 0,
  packet_loss_pct numeric NOT NULL DEFAULT 0,
  quality_status text NOT NULL DEFAULT 'unknown',
  last_quality_at timestamptz,
  PRIMARY KEY (session_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_call_participants TO authenticated;
GRANT ALL ON public.group_call_participants TO service_role;
ALTER TABLE public.group_call_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gcp_select ON public.group_call_participants;
CREATE POLICY gcp_select ON public.group_call_participants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.group_call_sessions s
    WHERE s.id = session_id AND public.is_conversation_participant(s.conversation_id, auth.uid())
  ));
DROP POLICY IF EXISTS gcp_insert ON public.group_call_participants;
CREATE POLICY gcp_insert ON public.group_call_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.group_call_sessions s
    WHERE s.id = session_id AND public.is_conversation_participant(s.conversation_id, auth.uid())
  ));
DROP POLICY IF EXISTS gcp_update ON public.group_call_participants;
CREATE POLICY gcp_update ON public.group_call_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS gcp_delete ON public.group_call_participants;
CREATE POLICY gcp_delete ON public.group_call_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- User call preferences (memorize last chosen quality per user)
CREATE TABLE IF NOT EXISTS public.user_call_preferences (
  user_id uuid PRIMARY KEY,
  preferred_quality text NOT NULL DEFAULT 'auto' CHECK (preferred_quality IN ('eco','auto','hd','fhd')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_call_preferences TO authenticated;
GRANT ALL ON public.user_call_preferences TO service_role;
ALTER TABLE public.user_call_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ucp_all ON public.user_call_preferences;
CREATE POLICY ucp_all ON public.user_call_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- RPC: sync chosen quality across the call (any participant may update, host may lock)
CREATE OR REPLACE FUNCTION public.set_group_call_quality(_session_id uuid, _quality text, _lock boolean DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _conv uuid;
  _host uuid;
  _locked boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quality NOT IN ('eco','auto','hd','fhd') THEN RAISE EXCEPTION 'Invalid quality'; END IF;

  SELECT conversation_id, host_id, quality_locked INTO _conv, _host, _locked
  FROM public.group_call_sessions WHERE id = _session_id;
  IF _conv IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF NOT public.is_conversation_participant(_conv, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  -- If locked, only host may change quality
  IF _locked AND _host <> auth.uid() THEN
    RAISE EXCEPTION 'Quality locked by host';
  END IF;

  UPDATE public.group_call_sessions
    SET preferred_quality = _quality,
        quality_locked = COALESCE(_lock, quality_locked)
    WHERE id = _session_id;

  -- memorize per user
  INSERT INTO public.user_call_preferences (user_id, preferred_quality, updated_at)
  VALUES (auth.uid(), _quality, now())
  ON CONFLICT (user_id) DO UPDATE
    SET preferred_quality = EXCLUDED.preferred_quality,
        updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_call_quality(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_group_call_quality(uuid, text, boolean) TO authenticated;

-- Enable Realtime for group call tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_call_participants;
