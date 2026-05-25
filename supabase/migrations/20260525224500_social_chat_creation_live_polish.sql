-- Social polish: chat wallpapers, direct-call signaling, comment audio and streak storage.

alter table public.comments
  add column if not exists media_url text,
  add column if not exists media_type text;

create table if not exists public.chat_preferences (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  background text not null,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.chat_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_preferences' and policyname = 'Users manage their own chat preferences'
  ) then
    create policy "Users manage their own chat preferences"
    on public.chat_preferences
    for all
    using (
      auth.uid() = user_id and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = chat_preferences.conversation_id and cp.user_id = auth.uid()
      )
    )
    with check (
      auth.uid() = user_id and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = chat_preferences.conversation_id and cp.user_id = auth.uid()
      )
    );
  end if;
end $$;

create table if not exists public.direct_call_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'connected', 'missed', 'declined', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists direct_call_sessions_conversation_idx on public.direct_call_sessions(conversation_id, created_at desc);
create index if not exists direct_call_sessions_recipient_idx on public.direct_call_sessions(recipient_id, status);

alter table public.direct_call_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'direct_call_sessions' and policyname = 'Conversation participants can manage direct calls'
  ) then
    create policy "Conversation participants can manage direct calls"
    on public.direct_call_sessions
    for all
    using (
      auth.uid() in (caller_id, recipient_id)
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = direct_call_sessions.conversation_id and cp.user_id = auth.uid()
      )
    )
    with check (
      auth.uid() = caller_id
      and exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = direct_call_sessions.conversation_id and cp.user_id = auth.uid()
      )
    );
  end if;
end $$;

create table if not exists public.chat_streaks (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  streak_count integer not null default 0,
  last_message_date date,
  updated_at timestamptz not null default now(),
  check (user_a <> user_b)
);

alter table public.chat_streaks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_streaks' and policyname = 'Conversation participants can read streaks'
  ) then
    create policy "Conversation participants can read streaks"
    on public.chat_streaks
    for select
    using (
      exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = chat_streaks.conversation_id and cp.user_id = auth.uid()
      )
    );
  end if;
end $$;

create or replace function public.touch_chat_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_ids uuid[];
  a uuid;
  b uuid;
  previous_date date;
  previous_count integer;
  today date := current_date;
begin
  select array_agg(user_id order by user_id)
    into participant_ids
  from public.conversation_participants
  where conversation_id = new.conversation_id;

  if array_length(participant_ids, 1) < 2 then
    return new;
  end if;

  a := participant_ids[1];
  b := participant_ids[2];

  select last_message_date, streak_count
    into previous_date, previous_count
  from public.chat_streaks
  where conversation_id = new.conversation_id
  for update;

  if previous_date = today then
    update public.chat_streaks
      set updated_at = now()
    where conversation_id = new.conversation_id;
  else
    insert into public.chat_streaks (conversation_id, user_a, user_b, streak_count, last_message_date, updated_at)
    values (
      new.conversation_id,
      a,
      b,
      case when previous_date = today - 1 then coalesce(previous_count, 0) + 1 else 1 end,
      today,
      now()
    )
    on conflict (conversation_id) do update
      set streak_count = excluded.streak_count,
          last_message_date = excluded.last_message_date,
          updated_at = excluded.updated_at;
  end if;

  return new;
end $$;

drop trigger if exists touch_chat_streak_on_message on public.messages;
create trigger touch_chat_streak_on_message
after insert on public.messages
for each row execute function public.touch_chat_streak();

do $$
begin
  alter publication supabase_realtime add table public.chat_preferences;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.direct_call_sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_streaks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
