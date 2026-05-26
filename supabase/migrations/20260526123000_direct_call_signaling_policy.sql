-- Let both participants receive, accept, decline and end direct calls.
drop policy if exists "Conversation participants can manage direct calls" on public.direct_call_sessions;
drop policy if exists "Direct call participants can read calls" on public.direct_call_sessions;
drop policy if exists "Direct call callers can create calls" on public.direct_call_sessions;
drop policy if exists "Direct call participants can update calls" on public.direct_call_sessions;

create policy "Direct call participants can read calls"
on public.direct_call_sessions
for select
using (
  auth.uid() in (caller_id, recipient_id)
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = direct_call_sessions.conversation_id
      and cp.user_id = auth.uid()
  )
);

create policy "Direct call callers can create calls"
on public.direct_call_sessions
for insert
with check (
  auth.uid() = caller_id
  and caller_id <> recipient_id
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = direct_call_sessions.conversation_id
      and cp.user_id = auth.uid()
  )
);

create policy "Direct call participants can update calls"
on public.direct_call_sessions
for update
using (
  auth.uid() in (caller_id, recipient_id)
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = direct_call_sessions.conversation_id
      and cp.user_id = auth.uid()
  )
)
with check (
  auth.uid() in (caller_id, recipient_id)
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = direct_call_sessions.conversation_id
      and cp.user_id = auth.uid()
  )
);
