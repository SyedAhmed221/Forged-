-- Private storefront objects. Set a password for this dedicated role out of band.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'forged_packs') then
    create role forged_packs login noinherit;
  end if;
end $$;

create schema forge_packs;
revoke all on schema forge_packs from public, anon, authenticated;
grant usage on schema forge_packs to forged_packs;

create table forge_packs.orders (
  id uuid primary key,
  paypal_order_id text unique,
  capture_id text unique,
  product_id text not null,
  product_name text not null,
  file_key text not null,
  download_name text not null,
  price_minor integer not null check (price_minor > 0),
  currency text not null check (currency in ('GBP', 'EUR', 'USD')),
  buyer_email text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'reversed')),
  consent_version text not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  revoked_at timestamptz,
  download_count integer not null default 0,
  expires_at timestamptz,
  receipt_started_at timestamptz,
  receipt_sent_at timestamptz
);

create table forge_packs.revoked_captures (
  capture_id text primary key,
  status text not null check (status in ('refunded', 'reversed')),
  created_at timestamptz not null default now()
);

create table forge_packs.rate_limits (
  key text not null,
  window_start timestamptz not null,
  requests integer not null default 1,
  primary key (key, window_start)
);

alter table forge_packs.orders enable row level security;
alter table forge_packs.revoked_captures enable row level security;
alter table forge_packs.rate_limits enable row level security;
grant select, insert, update on forge_packs.orders, forge_packs.revoked_captures to forged_packs;
grant select, insert, update, delete on forge_packs.rate_limits to forged_packs;
create policy packs_orders on forge_packs.orders for all to forged_packs using (true) with check (true);
create policy packs_revocations on forge_packs.revoked_captures for all to forged_packs using (true) with check (true);
create policy packs_limits on forge_packs.rate_limits for all to forged_packs using (true) with check (true);
create index packs_rate_limits_window on forge_packs.rate_limits (window_start);
