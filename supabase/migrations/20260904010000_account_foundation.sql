create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '바이블온 사용자',
  nickname text,
  avatar_path text,
  representative_verse_ref text,
  representative_verse_text text,
  featured_achievement_id text,
  profile_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 2 and 40),
  constraint profiles_nickname_characters check (
    nickname is null or nickname ~ '^[가-힣A-Za-z0-9]+$'
  ),
  constraint profiles_nickname_not_numeric check (
    nickname is null or nickname !~ '^[0-9]+$'
  ),
  constraint profiles_nickname_length check (
    nickname is null or (
      char_length(nickname) + char_length(regexp_replace(nickname, '[^가-힣]', '', 'g'))
    ) between 4 and 16
  )
);

create unique index if not exists profiles_nickname_unique
  on public.profiles (lower(nickname))
  where nickname is not null;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_translation text not null default 'KRV'
    check (default_translation in ('KRV', 'RNKSV')),
  theme_preference text not null default 'system'
    check (theme_preference in ('light', 'dark', 'system', 'schedule')),
  theme_control_mode text not null default 'system'
    check (theme_control_mode in ('always', 'system', 'schedule')),
  dark_mode_start time not null default '21:00',
  dark_mode_end time not null default '07:00',
  timezone text not null default 'Asia/Seoul',
  onboarding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null,
  platform text not null check (platform in ('web', 'ios', 'android')),
  push_token text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

create table if not exists public.client_migrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  migration_key text not null,
  batch_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, migration_key)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    case
      when char_length(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''))) between 2 and 40
        then btrim(new.raw_user_meta_data ->> 'display_name')
      else '바이블온 사용자'
    end
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.device_installations enable row level security;
alter table public.client_migrations enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.user_preferences from anon, authenticated;
revoke all on public.device_installations from anon, authenticated;
revoke all on public.client_migrations from anon, authenticated;

grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.device_installations to authenticated;
grant select, insert, update, delete on public.client_migrations to authenticated;

drop policy if exists "authenticated profiles are discoverable" on public.profiles;
create policy "authenticated profiles are discoverable"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "users manage own preferences" on public.user_preferences;
create policy "users manage own preferences"
on public.user_preferences for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users manage own installations" on public.device_installations;
create policy "users manage own installations"
on public.device_installations for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users manage own migration records" on public.client_migrations;
create policy "users manage own migration records"
on public.client_migrations for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
