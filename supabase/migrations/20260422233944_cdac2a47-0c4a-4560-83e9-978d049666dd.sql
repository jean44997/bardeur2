DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'lives'
      AND constraint_name = 'lives_user_id_fkey'
  ) THEN
    ALTER TABLE public.lives
      ADD CONSTRAINT lives_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'live_messages'
      AND constraint_name = 'live_messages_live_id_fkey'
  ) THEN
    ALTER TABLE public.live_messages
      ADD CONSTRAINT live_messages_live_id_fkey
      FOREIGN KEY (live_id) REFERENCES public.lives(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'live_messages'
      AND constraint_name = 'live_messages_user_id_fkey'
  ) THEN
    ALTER TABLE public.live_messages
      ADD CONSTRAINT live_messages_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_likes_count ON public.likes;
CREATE TRIGGER update_likes_count
AFTER INSERT OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.update_video_likes_count();

DROP TRIGGER IF EXISTS update_saves_count ON public.saves;
CREATE TRIGGER update_saves_count
AFTER INSERT OR DELETE ON public.saves
FOR EACH ROW EXECUTE FUNCTION public.update_video_saves_count();

DROP TRIGGER IF EXISTS update_comments_count ON public.comments;
CREATE TRIGGER update_comments_count
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.update_video_comments_count();

DROP TRIGGER IF EXISTS notify_follow ON public.follows;
CREATE TRIGGER notify_follow
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.create_follow_notification();

DROP TRIGGER IF EXISTS notify_like ON public.likes;
CREATE TRIGGER notify_like
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.create_like_notification();

DROP TRIGGER IF EXISTS notify_comment ON public.comments;
CREATE TRIGGER notify_comment
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.create_comment_notification();

DROP TRIGGER IF EXISTS notify_message ON public.messages;
CREATE TRIGGER notify_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.create_message_notification();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='Users can update own comments') THEN
    CREATE POLICY "Users can update own comments"
    ON public.comments
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='Users can delete own messages') THEN
    CREATE POLICY "Users can delete own messages"
    ON public.messages
    FOR DELETE
    USING (auth.uid() = sender_id OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='Users can delete own notifications') THEN
    CREATE POLICY "Users can delete own notifications"
    ON public.notifications
    FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

ALTER TABLE public.lives REPLICA IDENTITY FULL;
ALTER TABLE public.live_messages REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.likes REPLICA IDENTITY FULL;
ALTER TABLE public.saves REPLICA IDENTITY FULL;
ALTER TABLE public.comments REPLICA IDENTITY FULL;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.lives; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.likes; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.saves; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comments; EXCEPTION WHEN duplicate_object THEN NULL; END $$;