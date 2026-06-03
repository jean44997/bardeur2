REVOKE ALL ON FUNCTION public.cleanup_expired_stories() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_stories() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_stories() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_stories() TO service_role;