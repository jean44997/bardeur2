-- Allow anonymous visitors to read only the public columns of profiles.
-- Column-level grants ensure private behaviour settings remain hidden from anon.
CREATE POLICY "Profiles public columns readable"
ON public.profiles FOR SELECT TO anon USING (true);

GRANT SELECT (id, username, display_name, bio, avatar_url, website, is_private, created_at, updated_at)
ON public.profiles TO anon;