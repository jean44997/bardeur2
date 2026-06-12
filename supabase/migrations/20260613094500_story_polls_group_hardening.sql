-- Reliable story views, group chat controls, polls, and group call sessions.

create table if not exists public.message_poll_votes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_text text not null check (char_length(option_text) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

alter table public.message_poll_votes enable row level security;

create index if not exists idx_message_poll_votes_conversation on public.message_poll_votes(conversation_id, created_at desc);
create index if not exists idx_message_poll_votes_message on public.message_poll_votes(message_id);

drop policy if exists "Participants can view poll votes" on public.message_poll_votes;
create policy "Participants can view poll votes"
on public.message_poll_votes
for select
using (
  exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = message_poll_votes.conversation_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Participants can vote in polls" on public.message_poll_votes;
create policy "Participants can vote in polls"
on public.message_poll_votes
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = message_poll_votes.conversation_id
      and cp.user_id = auth.uid()
  )
  and exists (
    select 1 from public.messages m
    where m.id = message_poll_votes.message_id
      and m.conversation_id = message_poll_votes.conversation_id
  )
);

drop policy if exists "Participants can update own poll vote" on public.message_poll_votes;
create policy "Participants can update own poll vote"
on public.message_poll_votes
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = message_poll_votes.conversation_id
      and cp.user_id = auth.uid()
  )
);

create table if not exists public.group_call_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'active' check (status in ('active', 'ended', 'missed')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.group_call_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.group_call_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (session_id, user_id)
);

alter table public.group_call_sessions enable row level security;
alter table public.group_call_participants enable row level security;

create index if not exists idx_group_call_sessions_conversation on public.group_call_sessions(conversation_id, created_at desc);
create index if not exists idx_group_call_participants_session on public.group_call_participants(session_id, joined_at);

drop policy if exists "Group participants can read group calls" on public.group_call_sessions;
create policy "Group participants can read group calls"
on public.group_call_sessions
for select
using (
  exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = group_call_sessions.conversation_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Group participants can create group calls" on public.group_call_sessions;
create policy "Group participants can create group calls"
on public.group_call_sessions
for insert
with check (
  auth.uid() = host_id
  and exists (
    select 1 from public.conversation_participants cp
    join public.conversations c on c.id = cp.conversation_id
    where cp.conversation_id = group_call_sessions.conversation_id
      and cp.user_id = auth.uid()
      and coalesce(c.is_group, false) = true
  )
);

drop policy if exists "Group call hosts can update calls" on public.group_call_sessions;
create policy "Group call hosts can update calls"
on public.group_call_sessions
for update
using (
  auth.uid() = host_id
  or exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = group_call_sessions.conversation_id
      and cp.user_id = auth.uid()
  )
)
with check (
  auth.uid() = host_id
  or exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = group_call_sessions.conversation_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Group participants can read call members" on public.group_call_participants;
create policy "Group participants can read call members"
on public.group_call_participants
for select
using (
  exists (
    select 1
    from public.group_call_sessions s
    join public.conversation_participants cp on cp.conversation_id = s.conversation_id
    where s.id = group_call_participants.session_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Group participants can join calls" on public.group_call_participants;
create policy "Group participants can join calls"
on public.group_call_participants
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.group_call_sessions s
    join public.conversation_participants cp on cp.conversation_id = s.conversation_id
    where s.id = group_call_participants.session_id
      and cp.user_id = auth.uid()
  )
);

create or replace function public.create_friend_group_conversation(_member_ids uuid[], _group_name text default 'Groupe amis')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _current_user_id uuid := auth.uid();
  _conversation_id uuid;
  _member_id uuid;
  _clean_members uuid[];
begin
  if _current_user_id is null then
    raise exception 'authentication required';
  end if;

  select array_agg(distinct member_id)
  into _clean_members
  from unnest(_member_ids) as member_id
  where member_id is not null and member_id <> _current_user_id;

  if coalesce(array_length(_clean_members, 1), 0) < 3 then
    raise exception 'at least 3 friends are required';
  end if;

  if array_length(_clean_members, 1) > 20 then
    raise exception 'group limit exceeded';
  end if;

  foreach _member_id in array _clean_members loop
    if not exists (
      select 1
      from public.follows f1
      join public.follows f2
        on f2.follower_id = _member_id
       and f2.following_id = _current_user_id
      where f1.follower_id = _current_user_id
        and f1.following_id = _member_id
    ) then
      raise exception 'only mutual friends can be added';
    end if;
  end loop;

  insert into public.conversations (is_group, group_name)
  values (true, left(coalesce(nullif(trim(_group_name), ''), 'Groupe amis'), 80))
  returning id into _conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (_conversation_id, _current_user_id)
  on conflict do nothing;

  foreach _member_id in array _clean_members loop
    insert into public.conversation_participants (conversation_id, user_id)
    values (_conversation_id, _member_id)
    on conflict do nothing;
  end loop;

  return _conversation_id;
end;
$$;

create or replace function public.add_friend_group_members(_conversation_id uuid, _member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _current_user_id uuid := auth.uid();
  _member_id uuid;
  _clean_members uuid[];
  _current_count integer;
  _added integer := 0;
  _row_count integer := 0;
begin
  if _current_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id
    where c.id = _conversation_id
      and coalesce(c.is_group, false) = true
      and cp.user_id = _current_user_id
  ) then
    raise exception 'not a group participant';
  end if;

  select array_agg(distinct member_id)
  into _clean_members
  from unnest(_member_ids) as member_id
  where member_id is not null and member_id <> _current_user_id;

  if coalesce(array_length(_clean_members, 1), 0) = 0 then
    return 0;
  end if;

  select count(*) into _current_count
  from public.conversation_participants
  where conversation_id = _conversation_id;

  if _current_count + array_length(_clean_members, 1) > 20 then
    raise exception 'group limit exceeded';
  end if;

  foreach _member_id in array _clean_members loop
    if not exists (
      select 1
      from public.follows f1
      join public.follows f2
        on f2.follower_id = _member_id
       and f2.following_id = _current_user_id
      where f1.follower_id = _current_user_id
        and f1.following_id = _member_id
    ) then
      raise exception 'only mutual friends can be added';
    end if;

    insert into public.conversation_participants (conversation_id, user_id)
    values (_conversation_id, _member_id)
    on conflict do nothing;

    get diagnostics _row_count = row_count;
    _added := _added + _row_count;
  end loop;

  update public.conversations set updated_at = now() where id = _conversation_id;
  return _added;
end;
$$;

create or replace function public.remove_group_member(_conversation_id uuid, _member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _current_user_id uuid := auth.uid();
  _count integer;
begin
  if _current_user_id is null then
    raise exception 'authentication required';
  end if;

  if _member_id = _current_user_id then
    raise exception 'use leave group instead';
  end if;

  if not exists (
    select 1
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id
    where c.id = _conversation_id
      and coalesce(c.is_group, false) = true
      and cp.user_id = _current_user_id
  ) then
    raise exception 'not a group participant';
  end if;

  select count(*) into _count
  from public.conversation_participants
  where conversation_id = _conversation_id;

  if _count <= 3 then
    raise exception 'a group needs at least 3 members';
  end if;

  delete from public.conversation_participants
  where conversation_id = _conversation_id
    and user_id = _member_id;

  update public.conversations set updated_at = now() where id = _conversation_id;
  return true;
end;
$$;

create or replace function public.delete_friend_group_conversation(_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _current_user_id uuid := auth.uid();
begin
  if _current_user_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id
    where c.id = _conversation_id
      and coalesce(c.is_group, false) = true
      and cp.user_id = _current_user_id
  ) then
    raise exception 'not a group participant';
  end if;

  delete from public.conversations where id = _conversation_id and coalesce(is_group, false) = true;
  return true;
end;
$$;

create or replace function public.record_story_view(_story_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _current_user_id uuid := auth.uid();
  _story public.stories%rowtype;
  _count integer;
begin
  if _current_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into _story
  from public.stories
  where id = _story_id
    and expires_at > now();

  if _story.id is null then
    raise exception 'story not found';
  end if;

  if _story.user_id <> _current_user_id then
    if not (
      coalesce(_story.audience, 'public') = 'public'
      or (
        _story.audience = 'followers'
        and exists (
          select 1 from public.follows f
          where f.follower_id = _current_user_id
            and f.following_id = _story.user_id
        )
      )
      or (
        _story.audience = 'friends'
        and exists (
          select 1
          from public.follows f1
          join public.follows f2
            on f2.follower_id = _story.user_id
           and f2.following_id = _current_user_id
          where f1.follower_id = _current_user_id
            and f1.following_id = _story.user_id
        )
      )
    ) then
      raise exception 'story not visible';
    end if;

    insert into public.story_views (story_id, viewer_id, viewed_at)
    values (_story_id, _current_user_id, now())
    on conflict (story_id, viewer_id)
    do update set viewed_at = excluded.viewed_at;
  end if;

  select coalesce(views_count, 0) into _count
  from public.stories
  where id = _story_id;

  return coalesce(_count, 0);
end;
$$;

revoke all on function public.create_friend_group_conversation(uuid[], text) from public;
revoke all on function public.add_friend_group_members(uuid, uuid[]) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.delete_friend_group_conversation(uuid) from public;
revoke all on function public.record_story_view(uuid) from public;

grant execute on function public.create_friend_group_conversation(uuid[], text) to authenticated;
grant execute on function public.add_friend_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.delete_friend_group_conversation(uuid) to authenticated;
grant execute on function public.record_story_view(uuid) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.message_poll_votes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.group_call_sessions;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
