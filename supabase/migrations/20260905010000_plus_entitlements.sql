create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  status text not null default 'inactive'
    check (status in ('inactive', 'trialing', 'active', 'past_due', 'canceled')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_subscriptions_provider_subscription_unique
  on public.user_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

drop trigger if exists user_subscriptions_set_updated_at on public.user_subscriptions;
create trigger user_subscriptions_set_updated_at
before update on public.user_subscriptions
for each row execute function public.set_updated_at();

alter table public.user_subscriptions enable row level security;
revoke all on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;

drop policy if exists "users view own subscription" on public.user_subscriptions;
create policy "users view own subscription"
on public.user_subscriptions for select
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.user_subscriptions is
  'Server-authoritative BibleOn Plus entitlements. Only a trusted billing webhook or service-role process may write rows.';
