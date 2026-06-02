ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS media_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS media_type text DEFAULT '';