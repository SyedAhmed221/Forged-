-- Optional read-only helper for the private /admin dashboard when using
-- DATABASE_URL (forged_web) without setting SUPABASE_SERVICE_ROLE_KEY on Vercel.
-- Apply once as the Supabase database administrator in the SQL Editor.
create or replace function public.admin_user_billing()
returns table (
  user_id uuid,
  email text,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  billing_status text,
  access_until timestamptz,
  test_access_until timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id as user_id,
    u.email::text as email,
    u.created_at as signed_up_at,
    u.last_sign_in_at as last_sign_in_at,
    coalesce(b.status, 'free') as billing_status,
    b.access_until,
    b.test_access_until,
    b.stripe_customer_id,
    b.stripe_subscription_id
  from auth.users u
  left join public.billing_accounts b on b.user_id = u.id
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_billing() from public, anon, authenticated;
grant execute on function public.admin_user_billing() to forged_web;
