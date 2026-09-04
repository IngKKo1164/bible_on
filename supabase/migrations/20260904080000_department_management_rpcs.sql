create or replace function public.move_department_members(
  target_user_ids uuid[],
  destination_department uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  destination public.departments;
  target_user uuid;
  current_department uuid;
begin
  select * into destination from public.departments where id = destination_department;
  if not found then raise exception 'department not found'; end if;
  if not public.can_manage_department(destination_department) then raise exception 'not authorized'; end if;

  foreach target_user in array target_user_ids loop
    select department_id into current_department
    from public.department_members
    where church_id = destination.church_id and user_id = target_user;
    if current_department is null or not public.can_manage_department(current_department) then
      raise exception 'member outside managed department';
    end if;
    update public.department_members
    set department_id = destination_department, assigned_by = auth.uid(), assigned_at = now()
    where church_id = destination.church_id and user_id = target_user;
  end loop;
end;
$$;

create or replace function public.set_church_member_title(
  target_church uuid,
  target_user uuid,
  target_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_department uuid;
begin
  select department_id into target_department
  from public.department_members
  where church_id = target_church and user_id = target_user;
  if target_department is null then raise exception 'member department not found'; end if;
  if not public.can_manage_department(target_department) then raise exception 'not authorized'; end if;
  update public.church_memberships
  set title = nullif(btrim(target_title), ''), updated_at = now()
  where church_id = target_church and user_id = target_user and status = 'active';
end;
$$;

create or replace function public.remove_church_member(target_church uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_church_admin(target_church) then raise exception 'admin required'; end if;
  if target_user = auth.uid() then raise exception 'use leave or transfer flow'; end if;
  delete from public.church_memberships
  where church_id = target_church and user_id = target_user and church_role <> 'admin';
  if not found then raise exception 'member not found'; end if;
end;
$$;

revoke delete on public.departments from authenticated;
revoke all on function public.move_department_members(uuid[], uuid) from public, anon;
revoke all on function public.set_church_member_title(uuid, uuid, text) from public, anon;
revoke all on function public.remove_church_member(uuid, uuid) from public, anon;
grant execute on function public.move_department_members(uuid[], uuid) to authenticated;
grant execute on function public.set_church_member_title(uuid, uuid, text) to authenticated;
grant execute on function public.remove_church_member(uuid, uuid) to authenticated;
