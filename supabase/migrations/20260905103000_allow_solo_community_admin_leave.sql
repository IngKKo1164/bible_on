create or replace function public.leave_church(target_church uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  active_member_count bigint;
begin
  select church_role into actor_role
  from public.church_memberships
  where church_id = target_church
    and user_id = auth.uid()
    and status = 'active'
  for update;

  if actor_role is null then
    raise exception 'active membership not found';
  end if;

  if actor_role = 'admin' then
    select count(*) into active_member_count
    from public.church_memberships
    where church_id = target_church and status = 'active';

    if active_member_count > 1 then
      raise exception 'transfer administrator before leaving';
    end if;

    update public.churches
    set active = false, updated_at = now()
    where id = target_church;
  elsif exists (
    select 1 from public.department_managers
    where church_id = target_church and user_id = auth.uid()
  ) then
    raise exception 'department manager must contact community administrator';
  end if;

  update public.profiles
  set primary_community_id = null
  where id = auth.uid() and primary_community_id = target_church;

  delete from public.church_memberships
  where church_id = target_church and user_id = auth.uid();
end;
$$;

revoke all on function public.leave_church(uuid) from public, anon;
grant execute on function public.leave_church(uuid) to authenticated;
