-- Stable RPC signature for PostgREST schema cache: _group_name first, _member_ids second.

create or replace function public.create_friend_group_conversation_v2(_group_name text, _member_ids uuid[])
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

revoke all on function public.create_friend_group_conversation_v2(text, uuid[]) from public;
grant execute on function public.create_friend_group_conversation_v2(text, uuid[]) to authenticated;

notify pgrst, 'reload schema';
