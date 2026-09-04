create extension if not exists pgcrypto;

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  normalized_name text not null,
  profile_image_path text,
  representative_verse_ref text,
  representative_verse_text text,
  auto_join boolean not null default false,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index churches_normalized_name_unique
  on public.churches (lower(normalized_name));

create table public.church_memberships (
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'rejected')),
  church_role text not null default 'member'
    check (church_role in ('admin', 'member')),
  title text,
  requested_at timestamptz not null default now(),
  joined_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (church_id, user_id)
);

create unique index church_single_active_admin
  on public.church_memberships (church_id)
  where status = 'active' and church_role = 'admin';

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  parent_id uuid references public.departments(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  depth smallint not null default 1 check (depth between 1 and 5),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, church_id),
  unique (church_id, parent_id, name)
);

create table public.department_members (
  church_id uuid not null,
  department_id uuid not null,
  user_id uuid not null,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (department_id, user_id),
  unique (church_id, user_id),
  foreign key (department_id, church_id)
    references public.departments(id, church_id) on delete cascade,
  foreign key (church_id, user_id)
    references public.church_memberships(church_id, user_id) on delete cascade
);

create table public.department_managers (
  church_id uuid not null,
  department_id uuid not null,
  user_id uuid not null,
  appointed_by uuid not null references public.profiles(id),
  appointed_at timestamptz not null default now(),
  primary key (department_id, user_id),
  foreign key (department_id, church_id)
    references public.departments(id, church_id) on delete cascade,
  foreign key (church_id, user_id)
    references public.church_memberships(church_id, user_id) on delete cascade
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index friendships_unique_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group', 'qt')),
  church_id uuid references public.churches(id) on delete set null,
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references public.profiles(id),
  next_sequence bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'member')),
  visible_from_sequence bigint not null default 1 check (visible_from_sequence >= 1),
  last_read_sequence bigint not null default 0 check (last_read_sequence >= 0),
  muted boolean not null default false,
  starred boolean not null default false,
  invited_by uuid references public.profiles(id),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sequence bigint not null,
  content_type text not null default 'text'
    check (content_type in ('text', 'bible', 'qt_passage', 'image', 'file', 'audio', 'system')),
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_for_everyone_at timestamptz,
  unique (conversation_id, sequence)
);

create index messages_conversation_sequence_idx
  on public.messages (conversation_id, sequence desc);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart', 'like', 'check', 'amen', 'hallelujah')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.message_user_deletions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.qt_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  verse_ref text not null,
  verse_text text not null,
  translation_id text not null check (translation_id in ('KRV', 'RNKSV')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.church_announcements (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  visibility_department_id uuid references public.departments(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  content text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worship_services (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references public.churches(id) on delete cascade,
  visibility_department_id uuid references public.departments(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'completed')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  service_at timestamptz,
  core_verse_ref text not null,
  support_verse_ref text,
  hymn text,
  description text,
  pastor text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  destination jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create table public.user_bible_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  read_verse_ids jsonb not null default '[]'::jsonb,
  reading_state jsonb not null default '{"cycle":1,"eligible":true}'::jsonb,
  progress_history jsonb not null default '{"cycle":1,"points":{}}'::jsonb,
  recent_passages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(read_verse_ids) = 'array'),
  check (jsonb_typeof(reading_state) = 'object'),
  check (jsonb_typeof(progress_history) = 'object'),
  check (jsonb_typeof(recent_passages) = 'array')
);

create table public.verse_notes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  verse_id text not null,
  note text not null default '',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, verse_id)
);

create table public.verse_note_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  verse_id text not null,
  server_note text not null,
  incoming_note text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.verse_highlights (
  user_id uuid not null references public.profiles(id) on delete cascade,
  verse_id text not null,
  style jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, verse_id),
  check (jsonb_typeof(style) = 'object')
);

create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  achievement_type text not null,
  name text not null,
  earned_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, achievement_id)
);

create table public.home_ai_threads (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '새 대화',
  messages jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(messages) = 'array')
);

create or replace function public.is_church_member(target_church uuid, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_memberships
    where church_id = target_church and user_id = actor and status = 'active'
  );
$$;

create or replace function public.is_church_admin(target_church uuid, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_memberships
    where church_id = target_church and user_id = actor
      and status = 'active' and church_role = 'admin'
  );
$$;

create or replace function public.is_conversation_member(target_conversation uuid, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = target_conversation and user_id = actor
  );
$$;

create or replace function public.can_view_message(target_conversation uuid, target_sequence bigint, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation
      and cm.user_id = actor
      and target_sequence >= cm.visible_from_sequence
  ) and not exists (
    select 1 from public.message_user_deletions mud
    join public.messages m on m.id = mud.message_id
    where m.conversation_id = target_conversation
      and m.sequence = target_sequence
      and mud.user_id = actor
  );
$$;

create or replace function public.can_contact(target_user uuid, actor uuid default auth.uid())
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
        where status = 'accepted'
          and ((requester_id = actor and addressee_id = target_user)
            or (requester_id = target_user and addressee_id = actor))
      ) or exists (
        select 1
        from public.church_memberships mine
        join public.church_memberships theirs on theirs.church_id = mine.church_id
        where mine.user_id = actor and theirs.user_id = target_user
          and mine.status = 'active' and theirs.status = 'active'
      )
    )
  );
$$;

create or replace function public.can_view_profile(target_user uuid, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.can_contact(target_user, actor); $$;

create or replace function public.department_is_descendant(target_department uuid, ancestor_department uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive tree as (
    select id from public.departments where id = ancestor_department
    union all
    select d.id from public.departments d join tree t on d.parent_id = t.id
  )
  select exists (select 1 from tree where id = target_department);
$$;

create or replace function public.can_manage_department(target_department uuid, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.departments target
    where target.id = target_department
      and (
        public.is_church_admin(target.church_id, actor)
        or exists (
          select 1 from public.department_managers dm
          where dm.user_id = actor
            and dm.church_id = target.church_id
            and public.department_is_descendant(target.id, dm.department_id)
        )
      )
  );
$$;

create or replace function public.can_view_department_content(target_church uuid, target_department uuid, actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_church_member(target_church, actor) and (
    target_department is null
    or exists (
      select 1 from public.department_members dm
      where dm.church_id = target_church and dm.user_id = actor
        and public.department_is_descendant(dm.department_id, target_department)
    )
    or public.is_church_admin(target_church, actor)
  );
$$;

create or replace function public.validate_department_tree()
returns trigger
language plpgsql
set search_path = ''
as $$
declare parent_row public.departments;
begin
  if new.parent_id is null then
    new.depth := 1;
    return new;
  end if;
  select * into parent_row from public.departments where id = new.parent_id;
  if parent_row.id is null or parent_row.church_id <> new.church_id then
    raise exception 'parent department must belong to the same church';
  end if;
  if parent_row.depth >= 5 then raise exception 'department depth cannot exceed 5'; end if;
  new.depth := parent_row.depth + 1;
  return new;
end;
$$;

create trigger departments_validate_tree
before insert or update of parent_id, church_id on public.departments
for each row execute function public.validate_department_tree();

create or replace function public.assign_message_sequence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set next_sequence = next_sequence + 1, updated_at = now()
  where id = new.conversation_id
  returning next_sequence - 1 into new.sequence;
  if new.sequence is null then raise exception 'conversation not found'; end if;
  return new;
end;
$$;

create trigger messages_assign_sequence
before insert on public.messages
for each row execute function public.assign_message_sequence();

create trigger churches_set_updated_at before update on public.churches
for each row execute function public.set_updated_at();
create trigger church_memberships_set_updated_at before update on public.church_memberships
for each row execute function public.set_updated_at();
create trigger departments_set_updated_at before update on public.departments
for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();
create trigger church_announcements_set_updated_at before update on public.church_announcements
for each row execute function public.set_updated_at();
create trigger worship_services_set_updated_at before update on public.worship_services
for each row execute function public.set_updated_at();
create trigger user_bible_state_set_updated_at before update on public.user_bible_state
for each row execute function public.set_updated_at();
create trigger verse_notes_set_updated_at before update on public.verse_notes
for each row execute function public.set_updated_at();
create trigger verse_highlights_set_updated_at before update on public.verse_highlights
for each row execute function public.set_updated_at();
create trigger home_ai_threads_set_updated_at before update on public.home_ai_threads
for each row execute function public.set_updated_at();

alter table public.churches enable row level security;
alter table public.church_memberships enable row level security;
alter table public.departments enable row level security;
alter table public.department_members enable row level security;
alter table public.department_managers enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_user_deletions enable row level security;
alter table public.qt_sessions enable row level security;
alter table public.church_announcements enable row level security;
alter table public.worship_services enable row level security;
alter table public.notifications enable row level security;
alter table public.user_bible_state enable row level security;
alter table public.verse_notes enable row level security;
alter table public.verse_note_conflicts enable row level security;
alter table public.verse_highlights enable row level security;
alter table public.user_achievements enable row level security;
alter table public.home_ai_threads enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.churches to authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.church_memberships, public.departments, public.department_members,
  public.department_managers, public.friendships, public.user_blocks, public.conversations,
  public.conversation_members, public.messages, public.message_reactions, public.qt_sessions,
  public.church_announcements, public.worship_services, public.notifications to authenticated;
grant select, insert, update, delete on public.user_preferences, public.device_installations,
  public.client_migrations, public.user_bible_state, public.verse_notes,
  public.verse_note_conflicts, public.verse_highlights, public.user_achievements,
  public.home_ai_threads to authenticated;
grant update on public.notifications to authenticated;
grant insert, delete on public.friendships, public.user_blocks, public.message_reactions,
  public.message_user_deletions to authenticated;
grant insert on public.churches, public.church_memberships, public.departments,
  public.department_members, public.department_managers, public.church_announcements,
  public.worship_services to authenticated;
grant update, delete on public.churches, public.church_memberships, public.departments,
  public.department_members, public.department_managers, public.church_announcements,
  public.worship_services to authenticated;

drop policy if exists "authenticated profiles are discoverable" on public.profiles;
create policy "reachable profiles are discoverable" on public.profiles for select to authenticated
using (public.can_view_profile(id));

create policy "active churches are searchable" on public.churches for select to authenticated
using (active or public.is_church_admin(id));
create policy "users create churches" on public.churches for insert to authenticated
with check (created_by = auth.uid());
create policy "admins update churches" on public.churches for update to authenticated
using (public.is_church_admin(id)) with check (public.is_church_admin(id));

create policy "memberships visible to related users" on public.church_memberships for select to authenticated
using (user_id = auth.uid() or public.is_church_member(church_id));
create policy "users request membership" on public.church_memberships for insert to authenticated
with check (user_id = auth.uid() and church_role = 'member');
create policy "admins manage memberships" on public.church_memberships for update to authenticated
using (public.is_church_admin(church_id)) with check (public.is_church_admin(church_id));
create policy "admins or self remove membership" on public.church_memberships for delete to authenticated
using (
  (user_id = auth.uid() and church_role <> 'admin'
    and not exists (
      select 1 from public.department_managers dm
      where dm.church_id = church_memberships.church_id and dm.user_id = auth.uid()
    ))
  or (public.is_church_admin(church_id) and user_id <> auth.uid())
);

create policy "members view departments" on public.departments for select to authenticated
using (public.is_church_member(church_id));
create policy "authorized managers create departments" on public.departments for insert to authenticated
with check (public.is_church_admin(church_id) or (parent_id is not null and public.can_manage_department(parent_id)));
create policy "authorized managers update departments" on public.departments for update to authenticated
using (public.can_manage_department(id)) with check (public.can_manage_department(id));
create policy "authorized managers delete departments" on public.departments for delete to authenticated
using (public.can_manage_department(id));

create policy "members view department assignments" on public.department_members for select to authenticated
using (public.is_church_member(church_id));
create policy "managers assign department members" on public.department_members for all to authenticated
using (public.can_manage_department(department_id)) with check (public.can_manage_department(department_id));
create policy "members view department managers" on public.department_managers for select to authenticated
using (public.is_church_member(church_id));
create policy "admins appoint department managers" on public.department_managers for all to authenticated
using (public.is_church_admin(church_id)) with check (public.is_church_admin(church_id));

create policy "participants view friendships" on public.friendships for select to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "users request friendship" on public.friendships for insert to authenticated
with check (
  requester_id = auth.uid()
  and not exists (
    select 1 from public.user_blocks
    where (blocker_id = auth.uid() and blocked_id = addressee_id)
       or (blocker_id = addressee_id and blocked_id = auth.uid())
  )
);
create policy "participants remove friendship" on public.friendships for delete to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "users view own blocks" on public.user_blocks for select to authenticated
using (blocker_id = auth.uid());
create policy "users create own blocks" on public.user_blocks for insert to authenticated
with check (blocker_id = auth.uid());
create policy "users remove own blocks" on public.user_blocks for delete to authenticated
using (blocker_id = auth.uid());

create policy "members view conversations" on public.conversations for select to authenticated
using (public.is_conversation_member(id));
create policy "members view conversation roster" on public.conversation_members for select to authenticated
using (public.is_conversation_member(conversation_id));
create policy "members view visible messages" on public.messages for select to authenticated
using (public.can_view_message(conversation_id, sequence));
create policy "members view reactions" on public.message_reactions for select to authenticated
using (exists (select 1 from public.messages m where m.id = message_id and public.can_view_message(m.conversation_id, m.sequence)));
create policy "users add own reactions" on public.message_reactions for insert to authenticated
with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.can_view_message(m.conversation_id, m.sequence)));
create policy "users remove own reactions" on public.message_reactions for delete to authenticated
using (user_id = auth.uid());
create policy "users hide own messages" on public.message_user_deletions for insert to authenticated
with check (user_id = auth.uid());
create policy "users restore own hidden messages" on public.message_user_deletions for delete to authenticated
using (user_id = auth.uid());
create policy "members view qt sessions" on public.qt_sessions for select to authenticated
using (public.is_conversation_member(conversation_id));

create policy "members view scoped announcements" on public.church_announcements for select to authenticated
using (public.can_view_department_content(church_id, visibility_department_id));
create policy "managers create announcements" on public.church_announcements for insert to authenticated
with check (created_by = auth.uid() and (public.is_church_admin(church_id) or public.can_manage_department(visibility_department_id)));
create policy "authors manage announcements" on public.church_announcements for update to authenticated
using (created_by = auth.uid() and (public.is_church_admin(church_id) or public.can_manage_department(visibility_department_id)))
with check (created_by = auth.uid() and (public.is_church_admin(church_id) or public.can_manage_department(visibility_department_id)));
create policy "authors delete announcements" on public.church_announcements for delete to authenticated
using (created_by = auth.uid() and (public.is_church_admin(church_id) or public.can_manage_department(visibility_department_id)));

create policy "members view scoped worship" on public.worship_services for select to authenticated
using (public.can_view_department_content(church_id, visibility_department_id));
create policy "managers create worship" on public.worship_services for insert to authenticated
with check (created_by = auth.uid() and (public.is_church_admin(church_id) or public.can_manage_department(visibility_department_id)));
create policy "authors manage worship" on public.worship_services for update to authenticated
using (created_by = auth.uid() and (public.is_church_admin(church_id) or public.can_manage_department(visibility_department_id)))
with check (created_by = auth.uid() and (public.is_church_admin(church_id) or public.can_manage_department(visibility_department_id)));
create policy "authors delete worship" on public.worship_services for delete to authenticated
using (created_by = auth.uid() and (public.is_church_admin(church_id) or public.can_manage_department(visibility_department_id)));

create policy "users view own notifications" on public.notifications for select to authenticated
using (user_id = auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users manage own bible state" on public.user_bible_state for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own notes" on public.verse_notes for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own note conflicts" on public.verse_note_conflicts for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own highlights" on public.verse_highlights for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own achievements" on public.user_achievements for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own ai threads" on public.home_ai_threads for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.create_church(church_name text, normalized_church_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_church_id uuid; root_department_id uuid;
begin
  insert into public.churches(name, normalized_name, created_by)
  values (btrim(church_name), lower(btrim(normalized_church_name)), auth.uid())
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
    (select c.name from public.church_memberships cm
      join public.churches c on c.id = cm.church_id
      where cm.user_id = p.id and cm.status = 'active' limit 1)
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

create or replace function public.request_friendship(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare friendship_id uuid;
begin
  if target_user = auth.uid() then raise exception 'cannot add self'; end if;
  if not exists (select 1 from public.profiles where id = target_user) then raise exception 'profile not found'; end if;
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = auth.uid() and blocked_id = target_user)
       or (blocker_id = target_user and blocked_id = auth.uid())
  ) then raise exception 'friend request blocked'; end if;
  insert into public.friendships(requester_id, addressee_id)
  values (auth.uid(), target_user)
  returning id into friendship_id;
  return friendship_id;
end;
$$;

create or replace function public.request_church_membership(target_church uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare joins_automatically boolean; next_status text; root_department uuid;
begin
  select auto_join into joins_automatically from public.churches where id = target_church and active;
  if not found then raise exception 'church not found'; end if;
  next_status := case when joins_automatically then 'active' else 'pending' end;
  insert into public.church_memberships(church_id, user_id, status, church_role, joined_at)
  values (target_church, auth.uid(), next_status, 'member', case when joins_automatically then now() end)
  on conflict (church_id, user_id) do update
  set status = excluded.status, requested_at = now(), joined_at = excluded.joined_at, church_role = 'member';
  if joins_automatically then
    select id into root_department from public.departments
    where church_id = target_church and parent_id is null limit 1;
    insert into public.department_members(church_id, department_id, user_id, assigned_by)
    values (target_church, root_department, auth.uid(), auth.uid()) on conflict do nothing;
  end if;
  return next_status;
end;
$$;

create or replace function public.respond_church_membership(target_church uuid, target_user uuid, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare root_department uuid;
begin
  if not public.is_church_admin(target_church) then raise exception 'admin required'; end if;
  update public.church_memberships
  set status = case when accept_request then 'active' else 'rejected' end,
      joined_at = case when accept_request then now() else null end
  where church_id = target_church and user_id = target_user and status = 'pending';
  if not found then raise exception 'membership request not found'; end if;
  if accept_request then
    select id into root_department from public.departments
    where church_id = target_church and parent_id is null limit 1;
    insert into public.department_members(church_id, department_id, user_id, assigned_by)
    values (target_church, root_department, target_user, auth.uid()) on conflict do nothing;
  end if;
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
  ) then raise exception 'department manager must contact church administrator'; end if;
  delete from public.church_memberships
  where church_id = target_church and user_id = auth.uid();
  if not found then raise exception 'active membership not found'; end if;
end;
$$;

create or replace function public.transfer_church_admin(target_church uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_church_admin(target_church) then raise exception 'admin required'; end if;
  if not public.is_church_member(target_church, target_user) then raise exception 'target must be an active member'; end if;
  update public.church_memberships set church_role = 'member'
  where church_id = target_church and user_id = auth.uid();
  update public.church_memberships set church_role = 'admin'
  where church_id = target_church and user_id = target_user;
end;
$$;

create or replace function public.delete_department(target_department uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare parent_department uuid; target_church uuid;
begin
  if not public.can_manage_department(target_department) then raise exception 'manager permission required'; end if;
  select parent_id, church_id into parent_department, target_church
  from public.departments where id = target_department;
  if parent_department is null then raise exception 'root department cannot be deleted'; end if;
  insert into public.department_members(church_id, department_id, user_id, assigned_by)
  select target_church, parent_department, dm.user_id, auth.uid()
  from public.department_members dm
  where dm.department_id in (
    with recursive subtree as (
      select id from public.departments where id = target_department
      union all select d.id from public.departments d join subtree s on d.parent_id = s.id
    ) select id from subtree
  )
  on conflict (church_id, user_id) do update
  set department_id = excluded.department_id, assigned_by = auth.uid(), assigned_at = now();
  delete from public.departments where id = target_department;
end;
$$;

create or replace function public.respond_friend_request(friendship_id uuid, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.friendships
  set status = case when accept_request then 'accepted' else 'declined' end,
      responded_at = now()
  where id = friendship_id and addressee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'friend request not found'; end if;
end;
$$;

create or replace function public.create_conversation(
  conversation_kind text,
  conversation_name text,
  member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid; target uuid; all_members uuid[];
begin
  if conversation_kind not in ('direct', 'group', 'qt') then raise exception 'invalid conversation kind'; end if;
  all_members := array(select distinct unnest(array_append(coalesce(member_ids, '{}'::uuid[]), auth.uid())));
  if conversation_kind = 'direct' and cardinality(all_members) <> 2 then raise exception 'direct conversation requires two members'; end if;
  if conversation_kind <> 'direct' and cardinality(all_members) < 2 then raise exception 'group conversation requires at least two members'; end if;
  foreach target in array all_members loop
    if target <> auth.uid() and not public.can_contact(target) then raise exception 'member is not reachable'; end if;
  end loop;
  insert into public.conversations(kind, name, created_by)
  values (conversation_kind, nullif(btrim(conversation_name), ''), auth.uid()) returning id into new_id;
  insert into public.conversation_members(conversation_id, user_id, member_role, invited_by)
  select new_id, target, case when target = auth.uid() then 'owner' else 'member' end, auth.uid()
  from unnest(all_members) target;
  return new_id;
end;
$$;

create or replace function public.invite_conversation_members(target_conversation uuid, member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target uuid; first_visible bigint;
begin
  if not public.is_conversation_member(target_conversation) then raise exception 'not a conversation member'; end if;
  select next_sequence into first_visible from public.conversations where id = target_conversation;
  foreach target in array coalesce(member_ids, '{}'::uuid[]) loop
    if not public.can_contact(target) then raise exception 'member is not reachable'; end if;
    insert into public.conversation_members(conversation_id, user_id, visible_from_sequence, invited_by)
    values (target_conversation, target, first_visible, auth.uid()) on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.send_message(
  target_conversation uuid,
  message_type text,
  message_body text,
  message_payload jsonb default '{}'::jsonb
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare created_message public.messages;
begin
  if not public.is_conversation_member(target_conversation) then raise exception 'not a conversation member'; end if;
  insert into public.messages(conversation_id, sender_id, sequence, content_type, body, payload)
  values (target_conversation, auth.uid(), 0, message_type, coalesce(message_body, ''), coalesce(message_payload, '{}'::jsonb))
  returning * into created_message;
  return created_message;
end;
$$;

create or replace function public.mark_conversation_read(target_conversation uuid, read_sequence bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members
  set last_read_sequence = greatest(last_read_sequence, read_sequence)
  where conversation_id = target_conversation and user_id = auth.uid();
$$;

create or replace function public.cancel_message(target_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages set deleted_for_everyone_at = now(), body = '', payload = '{}'::jsonb
  where id = target_message and sender_id = auth.uid();
  if not found then raise exception 'message not found'; end if;
end;
$$;

create or replace function public.create_qt_session(
  target_conversation uuid,
  target_verse_ref text,
  target_verse_text text,
  target_translation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare session_id uuid;
begin
  if not public.is_conversation_member(target_conversation) then raise exception 'not a conversation member'; end if;
  insert into public.qt_sessions(conversation_id, verse_ref, verse_text, translation_id, created_by)
  values (target_conversation, target_verse_ref, target_verse_text, target_translation, auth.uid())
  returning id into session_id;
  perform public.send_message(target_conversation, 'qt_passage', 'QT 말씀 · ' || target_verse_ref,
    jsonb_build_object('reference', target_verse_ref, 'text', target_verse_text, 'translationId', target_translation));
  return session_id;
end;
$$;

revoke execute on function public.is_church_member(uuid, uuid) from public, anon;
revoke execute on function public.is_church_admin(uuid, uuid) from public, anon;
revoke execute on function public.is_conversation_member(uuid, uuid) from public, anon;
revoke execute on function public.can_view_message(uuid, bigint, uuid) from public, anon;
revoke execute on function public.can_contact(uuid, uuid) from public, anon;
revoke execute on function public.can_view_profile(uuid, uuid) from public, anon;
revoke execute on function public.department_is_descendant(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_department(uuid, uuid) from public, anon;
revoke execute on function public.can_view_department_content(uuid, uuid, uuid) from public, anon;
revoke execute on function public.validate_department_tree() from public, anon, authenticated;
revoke execute on function public.assign_message_sequence() from public, anon, authenticated;
grant execute on function public.create_church(text, text), public.respond_friend_request(uuid, boolean),
  public.find_profile_by_nickname(text), public.request_friendship(uuid),
  public.request_church_membership(uuid), public.respond_church_membership(uuid, uuid, boolean),
  public.leave_church(uuid), public.transfer_church_admin(uuid, uuid), public.delete_department(uuid),
  public.create_conversation(text, text, uuid[]), public.invite_conversation_members(uuid, uuid[]),
  public.send_message(uuid, text, text, jsonb), public.mark_conversation_read(uuid, bigint),
  public.cancel_message(uuid), public.create_qt_session(uuid, text, text, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members') then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
