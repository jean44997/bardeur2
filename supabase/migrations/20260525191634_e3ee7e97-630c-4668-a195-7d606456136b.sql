-- Allow the live owner (or an admin) to delete chat messages of their own live
CREATE POLICY "Live owner can delete live messages"
ON public.live_messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.lives l
    WHERE l.id = live_messages.live_id
      AND (l.user_id = auth.uid()
           OR public.has_role(auth.uid(), 'super_admin'::app_role)
           OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);