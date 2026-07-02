-- Group chat creation + group call realtime hardening.
-- Keeps the RPC names PostgREST has seen before, adds call quality telemetry,
-- and lets participants update only their own group-call presence row.

alter table public.group_call_participants
  add column if not exists latency_ms integer not null default 0,
  add column if not exists bitrate_kbps integer not null default 0,
  add column if not exists packet_loss_pct numeric(5,2) not null default 0,
  add column if not exists quality_status text not null default 'unknown',
  add column if not exists last_quality_at timestamptz;

create index if not exists idx_group_call_sessions_active_conversation
  on public.group_call_sessions(conversation_id, created_at desc)
  where status = 'active';

create index if not exists idx_group_call_participants_quality
  on public.group_call_participants(session_id, user_id, last_quality_at desc);

grant select, insert, update on public.group_call_sessions to authenticated;
grant select, insert, update on public.group_call_participants to authenticated;

drop policy if exists "Group call hosts can update calls" on public.group_call_sessions;
create policy "Group call hosts can update calls"
on public.group_call_sessions
for update
using (
  auth.uid() = host_id
)
with check (
  auth.uid() = host_id
);

drop policy if exists "Group participants can update own call presence" on public.group_call_participants;
create policy "Group participants can update own call presence"
on public.group_call_participants
for update
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.group_call_sessions s
    join public.conversation_participants cp on cp.conversation_id = s.conversation_id
    where s.id = group_call_participants.session_id
      and cp.user_id = auth.uid()
  )
)
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

create or replace function public.create_group_conversation_atomic(_group_name text, _member_ids uuid[])
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

revoke all on function public.create_group_conversation_atomic(text, uuid[]) from public;
grant execute on function public.create_group_conversation_atomic(text, uuid[]) to authenticated;

create or replace function public.create_friend_group_conversation(_group_name text, _member_ids uuid[])
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_group_conversation_atomic(_group_name, _member_ids);
$$;

revoke all on function public.create_friend_group_conversation(text, uuid[]) from public;
grant execute on function public.create_friend_group_conversation(text, uuid[]) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.group_call_sessions;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.group_call_participants;
exception when duplicate_object then
  null;
end $$;

notify pgrst, 'reload schema';
