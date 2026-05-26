-- Creator privacy, stories, create metadata and monetization scaffolding.

alter table public.profiles
  add column if not exists hide_following boolean not null default false,
  add column if not exists allow_profile_views boolean not null default true;

alter table public.videos
  add column if not exists audience text not null default 'public' check (audience in ('public', 'followers', 'private')),
  add column if not exists allow_downloads boolean not null default true,
  add column if not exists allow_duet boolean not null default true,
  add column if not exists allow_stitch boolean not null default true,
  add column if not exists auto_captions boolean not null default false,
  add column if not exists promote_after_publish boolean not null default false,
  add column if not exists brand_disclosure boolean not null default false,
  add column if not exists location_tag text,
  add column if not exists cover_note text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists create_options jsonb not null default '{}'::jsonb;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text not null,
  media_type text not null,
  audience text not null default 'public' check (audience in ('public', 'private', 'followers')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stories' and policyname = 'Story owners manage stories') then
    create policy "Story owners manage stories"
    on public.stories
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stories' and policyname = 'Visible public and follower stories') then
    create policy "Visible public and follower stories"
    on public.stories
    for select
    using (
      expires_at > now()
      and (
        audience = 'public'
        or auth.uid() = user_id
        or (
          audience = 'followers'
          and exists (
            select 1 from public.follows f
            where f.following_id = stories.user_id and f.follower_id = auth.uid()
          )
        )
      )
    );
  end if;
end $$;

create table if not exists public.monetization_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payout_email text,
  subscription_price_cents integer not null default 499,
  subscriber_perks text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.monetization_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'monetization_settings' and policyname = 'Users manage monetization settings') then
    create policy "Users manage monetization settings"
    on public.monetization_settings
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.creator_monetization_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

alter table public.creator_monetization_tasks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_monetization_tasks' and policyname = 'Users manage monetization tasks') then
    create policy "Users manage monetization tasks"
    on public.creator_monetization_tasks
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 1000),
  payout_email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.payout_requests enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payout_requests' and policyname = 'Users manage payout requests') then
    create policy "Users manage payout requests"
    on public.payout_requests
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

create table if not exists public.promote_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  objective text not null default 'views' check (objective in ('views', 'followers', 'website')),
  daily_budget_cents integer not null check (daily_budget_cents >= 200),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.promote_campaigns enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promote_campaigns' and policyname = 'Users manage promote campaigns') then
    create policy "Users manage promote campaigns"
    on public.promote_campaigns
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.stories;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.promote_campaigns;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
