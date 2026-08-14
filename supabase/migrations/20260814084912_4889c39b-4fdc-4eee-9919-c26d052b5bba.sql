ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_frequency text NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS dnd_until timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_notification_frequency_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_notification_frequency_check
      CHECK (notification_frequency IN ('instant','batched','daily','off'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);