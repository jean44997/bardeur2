-- Story viewer analytics and safer admin ban support.

alter table public.stories
  add column if not exists views_count integer not null default 0;

create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (story_id, viewer_id)
);

alter table public.story_views enable row level security;

create index if not exists idx_story_views_story on public.story_views(story_id, viewed_at desc);
create index if not exists idx_story_views_viewer on public.story_views(viewer_id, viewed_at desc);
create index if not exists idx_stories_user_active on public.stories(user_id, expires_at desc, created_at desc);

do $$
begin
  drop policy if exists "Authenticated can record story view" on public.story_views;
  drop policy if exists "Viewers can record story views" on public.story_views;

    create policy "Viewers can record story views"
    on public.story_views
    for insert
    with check (
      auth.uid() = viewer_id
      and exists (
        select 1
        from public.stories s
        where s.id = story_views.story_id
          and s.expires_at > now()
          and (
            s.audience = 'public'
            or s.user_id = auth.uid()
            or (
              s.audience = 'followers'
              and exists (
                select 1
                from public.follows f
                where f.following_id = s.user_id
                  and f.follower_id = auth.uid()
              )
            )
            or (
              s.audience = 'friends'
              and exists (
                select 1
                from public.follows f1
                join public.follows f2
                  on f2.follower_id = s.user_id
                 and f2.following_id = auth.uid()
                where f1.follower_id = auth.uid()
                  and f1.following_id = s.user_id
              )
            )
          )
      )
    );

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'story_views' and policyname = 'Story owners can read story views'
  ) then
    create policy "Story owners can read story views"
    on public.story_views
    for select
    using (
      auth.uid() = viewer_id
      or exists (
        select 1 from public.stories s
        where s.id = story_views.story_id and s.user_id = auth.uid()
      )
      or public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'super_admin')
    );
  end if;
end $$;

create or replace function public.increment_story_views_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stories
  set views_count = coalesce(views_count, 0) + 1
  where id = new.story_id;
  return new;
end;
$$;

drop trigger if exists trg_increment_story_views_count on public.story_views;
create trigger trg_increment_story_views_count
after insert on public.story_views
for each row execute function public.increment_story_views_count();

do $$
begin
  begin
    alter publication supabase_realtime add table public.story_views;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
