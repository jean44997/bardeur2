CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

GRANT SELECT, INSERT ON public.message_reads TO authenticated;
GRANT ALL ON public.message_reads TO service_role;

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read receipts in their conversations"
ON public.message_reads FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_participants cp
      ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reads.message_id
      AND cp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their own read receipt"
ON public.message_reads FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversation_participants cp
      ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reads.message_id
      AND cp.user_id = auth.uid()
      AND m.sender_id <> auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS message_reads_message_idx ON public.message_reads(message_id);
CREATE INDEX IF NOT EXISTS message_reads_user_idx ON public.message_reads(user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;