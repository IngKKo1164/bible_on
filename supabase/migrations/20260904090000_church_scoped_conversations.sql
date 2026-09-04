create or replace function public.create_conversation(
  conversation_kind text,
  conversation_name text,
  member_ids uuid[],
  target_church uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid; member_user_id uuid; all_members uuid[];
begin
  if conversation_kind not in ('direct', 'group', 'qt') then raise exception 'invalid conversation kind'; end if;
  all_members := array(select distinct unnest(array_append(coalesce(member_ids, '{}'::uuid[]), auth.uid())));
  if conversation_kind = 'direct' and cardinality(all_members) <> 2 then raise exception 'direct conversation requires two members'; end if;
  if conversation_kind <> 'direct' and cardinality(all_members) < 2 then raise exception 'group conversation requires at least two members'; end if;
  if target_church is not null and not public.is_church_member(target_church) then raise exception 'church membership required'; end if;
  foreach member_user_id in array all_members loop
    if member_user_id <> auth.uid() and not public.can_contact(member_user_id) then
      raise exception 'member is not reachable';
    end if;
    if target_church is not null and not public.is_church_member(target_church, member_user_id) then
      raise exception 'all participants must belong to the church';
    end if;
  end loop;
  insert into public.conversations(kind, church_id, name, created_by)
  values (conversation_kind, target_church, nullif(btrim(conversation_name), ''), auth.uid())
  returning id into new_id;
  insert into public.conversation_members(conversation_id, user_id, member_role, invited_by)
  select new_id, candidate.user_id,
    case when candidate.user_id = auth.uid() then 'owner' else 'member' end,
    auth.uid()
  from unnest(all_members) as candidate(user_id);
  return new_id;
end;
$$;

revoke all on function public.create_conversation(text, text, uuid[], uuid) from public, anon;
grant execute on function public.create_conversation(text, text, uuid[], uuid) to authenticated;
