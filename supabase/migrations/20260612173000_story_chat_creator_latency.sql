-- Story replies, smoother chat interactions and creator editor metadata.

alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists reply_preview text;

alter table public.videos
  add column if not exists editor_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_messages_reply_to on public.messages(reply_to_id);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 24),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, reaction)
);

alter table public.message_reactions enable row level security;

create index if not exists idx_message_reactions_conversation on public.message_reactions(conversation_id, created_at desc);
create index if not exists idx_message_reactions_message on public.message_reactions(message_id);

drop policy if exists "Participants can view message reactions" on public.message_reactions;
create policy "Participants can view message reactions"
on public.message_reactions
for select
using (
  exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = message_reactions.conversation_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Participants can react to messages" on public.message_reactions;
create policy "Participants can react to messages"
on public.message_reactions
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = message_reactions.conversation_id
      and cp.user_id = auth.uid()
  )
  and exists (
    select 1 from public.messages m
    where m.id = message_reactions.message_id
      and m.conversation_id = message_reactions.conversation_id
  )
);

drop policy if exists "Users remove own message reactions" on public.message_reactions;
create policy "Users remove own message reactions"
on public.message_reactions
for delete
using (auth.uid() = user_id);

create table if not exists public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  content text not null default '',
  media_url text not null default '',
  media_type text not null default '',
  created_at timestamptz not null default now()
);

alter table public.story_replies enable row level security;

create index if not exists idx_story_replies_story on public.story_replies(story_id, created_at desc);
create index if not exists idx_story_replies_recipient on public.story_replies(recipient_id, created_at desc);
create index if not exists idx_story_replies_sender on public.story_replies(sender_id, created_at desc);

drop policy if exists "Story reply participants can view" on public.story_replies;
create policy "Story reply participants can view"
on public.story_replies
for select
using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Visible story viewers can reply" on public.story_replies;
create policy "Visible story viewers can reply"
on public.story_replies
for insert
with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.stories s
    where s.id = story_replies.story_id
      and s.user_id = story_replies.recipient_id
      and s.user_id <> auth.uid()
      and s.expires_at > now()
      and (
        s.audience = 'public'
        or (
          s.audience = 'followers'
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid()
              and f.following_id = s.user_id
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

  if coalesce(array_length(_clean_members, 1), 0) = 0 then
    raise exception 'at least one friend is required';
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

revoke all on function public.create_friend_group_conversation(uuid[], text) from public;
grant execute on function public.create_friend_group_conversation(uuid[], text) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.message_reactions;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.story_replies;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
