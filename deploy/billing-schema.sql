-- Apply as administrator before deploying the billing routes and worker.
create table if not exists public.billing_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 stripe_customer_id text unique,
 stripe_subscription_id text unique,
 checkout_id text,
 status text not null default 'free',
 access_until timestamptz,
 test_access_until timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.billing_accounts enable row level security;
revoke all on public.billing_accounts from anon,authenticated;
grant select,insert,update on public.billing_accounts to forged_web;
grant select on public.billing_accounts to forged_worker;
create policy billing_owner on public.billing_accounts for all to forged_web using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy billing_worker on public.billing_accounts for select to forged_worker using(true);
