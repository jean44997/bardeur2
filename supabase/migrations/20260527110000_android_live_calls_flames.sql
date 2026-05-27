-- Android/PWA hardening: real direct-call WebRTC signaling, safer live/chat rates,
-- profile video visibility, and flame reward event tracking.

create table if not exists public.direct_call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.direct_call_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer', 'answer', 'candidate')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.direct_call_signals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'direct_call_signals' and policyname = 'Direct call users read signals') then
    create policy "Direct call users read signals"
    on public.direct_call_signals
    for select
    using (
      auth.uid() in (sender_id, recipient_id)
      and exists (
        select 1 from public.direct_call_sessions d
        where d.id = direct_call_signals.call_id
          and auth.uid() in (d.caller_id, d.recipient_id)
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'direct_call_signals' and policyname = 'Direct call users create signals') then
    create policy "Direct call users create signals"
    on public.direct_call_signals
    for insert
    with check (
      auth.uid() = sender_id
      and sender_id <> recipient_id
      and exists (
        select 1 from public.direct_call_sessions d
        where d.id = call_id
          and auth.uid() in (d.caller_id, d.recipient_id)
          and recipient_id in (d.caller_id, d.recipient_id)
      )
    );
  end if;
end $$;

create index if not exists idx_direct_call_signals_call_created on public.direct_call_signals(call_id, created_at);
create index if not exists idx_direct_call_signals_recipient_created on public.direct_call_signals(recipient_id, created_at desc);

create table if not exists public.flame_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  points integer not null default 1 check (points between 1 and 100),
  reason text not null default 'message',
  created_at timestamptz not null default now()
);

alter table public.flame_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flame_events' and policyname = 'Conversation users read flame events') then
    create policy "Conversation users read flame events"
    on public.flame_events
    for select
    using (
      exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = flame_events.conversation_id
          and cp.user_id = auth.uid()
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flame_events' and policyname = 'Users create own flame events') then
    create policy "Users create own flame events"
    on public.flame_events
    for insert
    with check (
      auth.uid() = sender_id
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = flame_events.conversation_id
          and cp.user_id = auth.uid()
      )
    );
  end if;
end $$;

alter table public.chat_streaks
  add column if not exists points_total integer not null default 0,
  add column if not exists reward_tier text not null default 'spark';

create or replace function public.record_flame_event_for_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _recipient_id uuid;
  _recent_count integer;
begin
  select cp.user_id into _recipient_id
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.sender_id
  limit 1;

  if _recipient_id is null then
    return new;
  end if;

  select count(*) into _recent_count
  from public.flame_events fe
  where fe.conversation_id = new.conversation_id
    and fe.sender_id = new.sender_id
    and fe.created_at > now() - interval '10 minutes';

  if _recent_count < 3 then
    insert into public.flame_events (conversation_id, sender_id, recipient_id, points, reason)
    values (
      new.conversation_id,
      new.sender_id,
      _recipient_id,
      case when coalesce(new.media_type, '') like 'audio/%' then 3 else 1 end,
      case when coalesce(new.media_type, '') like 'audio/%' then 'voice_reply' else 'message_reply' end
    );
  end if;

  update public.chat_streaks cs
  set points_total = greatest(0, coalesce(cs.points_total, 0)) + 1,
      reward_tier = case
        when greatest(0, coalesce(cs.points_total, 0)) + 1 >= 150 then 'vip'
        when greatest(0, coalesce(cs.points_total, 0)) + 1 >= 70 then 'super'
        when greatest(0, coalesce(cs.points_total, 0)) + 1 >= 25 then 'solid'
        else 'spark'
      end,
      updated_at = now()
  where cs.conversation_id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists record_flame_event_on_message on public.messages;
create trigger record_flame_event_on_message
after insert on public.messages
for each row execute function public.record_flame_event_for_message();

alter table public.lives
  add column if not exists quality_profile text not null default 'auto',
  add column if not exists stream_health text not null default 'starting',
  add column if not exists last_frame_at timestamptz;

create or replace function public.guard_live_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _recent_count integer;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Not authenticated';
  end if;

  if length(coalesce(new.content, '')) > 500 then
    raise exception 'Live message too long';
  end if;

  select count(*) into _recent_count
  from public.live_messages lm
  where lm.user_id = new.user_id
    and lm.created_at > now() - interval '30 seconds';

  if _recent_count >= 8 and not (public.has_role(new.user_id, 'admin') or public.has_role(new.user_id, 'super_admin')) then
    raise exception 'Live chat rate limit exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_live_message_insert_trigger on public.live_messages;
create trigger guard_live_message_insert_trigger
before insert on public.live_messages
for each row execute function public.guard_live_message_insert();

drop policy if exists "Videos visible by owner and audience" on public.videos;
create policy "Videos visible by owner and audience"
on public.videos
for select
using (
  auth.uid() = user_id
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_admin')
  or (
    coalesce(is_published, true) = true
    and coalesce(audience, 'public') = 'public'
  )
  or (
    coalesce(is_published, true) = true
    and coalesce(audience, 'public') = 'followers'
    and exists (
      select 1 from public.follows f
      where f.following_id = videos.user_id
        and f.follower_id = auth.uid()
    )
  )
);

create index if not exists idx_flame_events_conversation_created on public.flame_events(conversation_id, created_at desc);
create index if not exists idx_flame_events_sender_recent on public.flame_events(sender_id, created_at desc);
create index if not exists idx_lives_active_started_health on public.lives(is_active, started_at desc, stream_health);
create index if not exists idx_live_messages_user_created on public.live_messages(user_id, created_at desc);
create index if not exists idx_videos_audience_published_created on public.videos(audience, is_published, created_at desc);

do $$
begin
  alter publication supabase_realtime add table public.direct_call_signals;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.flame_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
