alter table public.churches
  add column if not exists community_kind text not null default 'church'
    check (community_kind in ('church', 'club', 'small_group', 'community'));

alter table public.churches alter column community_kind set default 'community';

alter table public.profiles
  add column if not exists primary_community_id uuid references public.churches(id) on delete set null;

create or replace function public.enforce_active_community_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare active_count integer;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text)::bigint);
  select count(*) into active_count
  from public.church_memberships
  where user_id = new.user_id and status = 'active';

  if active_count >= 3 then
    raise exception 'a user can join at most three communities' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists church_memberships_active_limit on public.church_memberships;
create trigger church_memberships_active_limit
before insert or update of status on public.church_memberships
for each row execute function public.enforce_active_community_limit();

create or replace function public.validate_primary_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.primary_community_id is not null and not exists (
    select 1 from public.church_memberships
    where church_id = new.primary_community_id
      and user_id = new.id
      and status = 'active'
  ) then
    raise exception 'primary community must be an active membership' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validate_primary_community on public.profiles;
create trigger profiles_validate_primary_community
before insert or update of primary_community_id on public.profiles
for each row execute function public.validate_primary_community();

drop function if exists public.create_church(text, text);
create function public.create_church(
  church_name text,
  normalized_church_name text,
  community_kind_input text default 'community'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_church_id uuid; root_department_id uuid;
begin
  if community_kind_input not in ('church', 'club', 'small_group', 'community') then
    raise exception 'invalid community kind';
  end if;

  insert into public.churches(name, normalized_name, community_kind, created_by)
  values (btrim(church_name), lower(btrim(normalized_church_name)), community_kind_input, auth.uid())
  returning id into new_church_id;
  insert into public.church_memberships(church_id, user_id, status, church_role, joined_at)
  values (new_church_id, auth.uid(), 'active', 'admin', now());
  insert into public.departments(church_id, parent_id, name, created_by)
  values (new_church_id, null, btrim(church_name), auth.uid()) returning id into root_department_id;
  insert into public.department_members(church_id, department_id, user_id, assigned_by)
  values (new_church_id, root_department_id, auth.uid(), auth.uid());
  return new_church_id;
end;
$$;

create or replace function public.leave_church(target_church uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_church_admin(target_church) then raise exception 'transfer administrator before leaving'; end if;
  if exists (
    select 1 from public.department_managers
    where church_id = target_church and user_id = auth.uid()
  ) then raise exception 'department manager must contact community administrator'; end if;
  update public.profiles set primary_community_id = null
  where id = auth.uid() and primary_community_id = target_church;
  delete from public.church_memberships
  where church_id = target_church and user_id = auth.uid();
  if not found then raise exception 'active membership not found'; end if;
end;
$$;

create or replace function public.find_profile_by_nickname(target_nickname text)
returns table (
  user_id uuid,
  display_name text,
  nickname text,
  avatar_path text,
  representative_verse_ref text,
  representative_verse_text text,
  church_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.nickname, p.avatar_path,
    p.representative_verse_ref, p.representative_verse_text,
    (select c.name
      from public.churches c
      join public.church_memberships cm on cm.church_id = c.id
      where c.id = p.primary_community_id and cm.user_id = p.id and cm.status = 'active'
      limit 1)
  from public.profiles p
  where lower(p.nickname) = lower(btrim(target_nickname))
    and p.id <> auth.uid()
    and not exists (
      select 1 from public.user_blocks ub
      where (ub.blocker_id = auth.uid() and ub.blocked_id = p.id)
         or (ub.blocker_id = p.id and ub.blocked_id = auth.uid())
    )
  limit 1;
$$;

create or replace function public.get_visible_profile_cards(target_user_ids uuid[])
returns table (
  id uuid,
  display_name text,
  nickname text,
  avatar_path text,
  representative_verse_ref text,
  representative_verse_text text,
  church_id uuid,
  church_name text,
  same_church boolean,
  department_name text,
  title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.nickname, p.avatar_path,
    p.representative_verse_ref, p.representative_verse_text,
    church.id, church.name, church.same_church,
    case when church.same_church then department.name end,
    case when church.same_church then membership.title end
  from public.profiles p
  left join lateral (
    select c.id, c.name,
      exists (
        select 1 from public.church_memberships mine
        where mine.church_id = c.id and mine.user_id = auth.uid() and mine.status = 'active'
      ) as same_church
    from public.church_memberships target_membership
    join public.churches c on c.id = target_membership.church_id
    where target_membership.user_id = p.id and target_membership.status = 'active'
    order by (c.id = p.primary_community_id) desc, same_church desc,
      target_membership.joined_at desc nulls last
    limit 1
  ) church on true
  left join public.church_memberships membership
    on membership.church_id = church.id and membership.user_id = p.id and membership.status = 'active'
  left join public.department_members department_membership
    on department_membership.church_id = church.id and department_membership.user_id = p.id
  left join public.departments department on department.id = department_membership.department_id
  where p.id = any(coalesce(target_user_ids, '{}'::uuid[]))
    and public.can_view_profile(p.id);
$$;

revoke all on function public.create_church(text, text, text) from public, anon;
grant execute on function public.create_church(text, text, text) to authenticated;
revoke all on function public.find_profile_by_nickname(text) from public, anon;
grant execute on function public.find_profile_by_nickname(text) to authenticated;
revoke all on function public.get_visible_profile_cards(uuid[]) from public, anon;
grant execute on function public.get_visible_profile_cards(uuid[]) to authenticated;
