create or replace function public.can_view_profile(target_user uuid, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select actor = target_user or (
    not exists (
      select 1 from public.user_blocks
      where (blocker_id = actor and blocked_id = target_user)
         or (blocker_id = target_user and blocked_id = actor)
    ) and (
      exists (
        select 1 from public.friendships
        where status in ('pending', 'accepted')
          and ((requester_id = actor and addressee_id = target_user)
            or (requester_id = target_user and addressee_id = actor))
      ) or exists (
        select 1
        from public.church_memberships mine
        join public.church_memberships theirs on theirs.church_id = mine.church_id
        where mine.user_id = actor and theirs.user_id = target_user
          and mine.status = 'active' and theirs.status = 'active'
      ) or exists (
        select 1
        from public.church_memberships applicant
        where applicant.user_id = target_user and applicant.status = 'pending'
          and public.is_church_admin(applicant.church_id, actor)
      ) or exists (
        select 1
        from public.conversation_members mine
        join public.conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
        where mine.user_id = actor and theirs.user_id = target_user
      )
    )
  );
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
    order by same_church desc, target_membership.joined_at desc nulls last
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

revoke all on function public.get_visible_profile_cards(uuid[]) from public, anon;
grant execute on function public.get_visible_profile_cards(uuid[]) to authenticated;
