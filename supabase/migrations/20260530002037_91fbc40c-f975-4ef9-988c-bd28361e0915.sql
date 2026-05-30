REVOKE EXECUTE ON FUNCTION public.set_thought_of_day(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.send_admin_official_message(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_thought_of_day(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_admin_official_message(uuid, text) TO authenticated;