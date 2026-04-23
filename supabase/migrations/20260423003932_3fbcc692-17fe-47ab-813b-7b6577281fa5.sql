CREATE TABLE IF NOT EXISTS public.direct_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  video_id UUID,
  media_url TEXT,
  media_type TEXT,
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT direct_shares_sender_recipient_check CHECK (sender_id <> recipient_id),
  CONSTRAINT direct_shares_payload_check CHECK (video_id IS NOT NULL OR media_url IS NOT NULL OR NULLIF(message, '') IS NOT NULL)
);

ALTER TABLE public.direct_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Friends can view own shares"
ON public.direct_shares
FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Mutual friends can create shares"
ON public.direct_shares
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.follows f1
    WHERE f1.follower_id = sender_id AND f1.following_id = recipient_id
  )
  AND EXISTS (
    SELECT 1 FROM public.follows f2
    WHERE f2.follower_id = recipient_id AND f2.following_id = sender_id
  )
);

CREATE POLICY "Users can delete own sent shares"
ON public.direct_shares
FOR DELETE
USING (auth.uid() = sender_id);

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS xp_total INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS xp_daily INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS xp_daily_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.refresh_daily_xp(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET xp_daily = CASE
      WHEN xp_daily_refreshed_at < now() - interval '24 hours' THEN 0
      ELSE xp_daily
    END,
    xp_daily_refreshed_at = CASE
      WHEN xp_daily_refreshed_at < now() - interval '24 hours' THEN now()
      ELSE xp_daily_refreshed_at
    END
  WHERE id = _profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_profile_xp(_profile_id uuid, _xp integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_daily_xp(_profile_id);

  UPDATE public.profiles
  SET xp_total = COALESCE(xp_total, 0) + GREATEST(_xp, 0),
      xp_daily = COALESCE(xp_daily, 0) + GREATEST(_xp, 0)
  WHERE id = _profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_live_message_read(_live_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_messages
  SET media_type = media_type
  WHERE live_id = _live_id AND user_id <> _user_id;
END;
$$;

ALTER TABLE public.live_messages
ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS seen_by UUID[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.set_live_message_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_status IS NULL OR NEW.delivery_status = 'sent' THEN
    NEW.delivery_status := 'delivered';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_live_message_delivered_trigger ON public.live_messages;
CREATE TRIGGER set_live_message_delivered_trigger
BEFORE INSERT ON public.live_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_live_message_delivered();

CREATE OR REPLACE FUNCTION public.mark_live_chat_seen(_live_id uuid, _viewer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_messages
  SET seen_by = CASE
    WHEN _viewer_id = ANY(seen_by) THEN seen_by
    ELSE array_append(seen_by, _viewer_id)
  END
  WHERE live_id = _live_id
    AND user_id <> _viewer_id;
END;
$$;

CREATE POLICY "Users can update seen state on live messages"
ON public.live_messages
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create profile views"
ON public.profile_views
FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Users can see own profile views" ON public.profile_views;
CREATE POLICY "Profile owners and admins can view profile views"
ON public.profile_views
FOR SELECT
USING (
  auth.uid() = profile_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE OR REPLACE FUNCTION public.create_share_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, from_user_id, type, content, reference_id)
  VALUES (NEW.recipient_id, NEW.sender_id, 'share', 't’a partagé un contenu', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_share_notification_trigger ON public.direct_shares;
CREATE TRIGGER create_share_notification_trigger
AFTER INSERT ON public.direct_shares
FOR EACH ROW
EXECUTE FUNCTION public.create_share_notification();