ALTER TABLE public.live_messages
ADD COLUMN IF NOT EXISTS media_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS media_type text DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_live_messages_live_created ON public.live_messages(live_id, created_at);