-- Apply as the Supabase database administrator. Supply login passwords separately.
do $$ begin
 if not exists(select from pg_roles where rolname='forged_web') then create role forged_web login noinherit; end if;
 if not exists(select from pg_roles where rolname='forged_worker') then create role forged_worker login noinherit; end if;
end $$;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '', tier text not null default 'free', role text not null default 'user',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.video_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 filename text not null, status text not null default 'uploading' check(status in ('uploading','uploaded','queued','processing','completed','failed','cancelled','deleting')),
 source_object_key text not null, pending_object_key text not null, output_object_key text,
 input_size_bytes bigint not null check(input_size_bytes>0), output_size_bytes bigint,
 input_metadata jsonb, output_metadata jsonb, use_encoder boolean not null default false,
 provider_job_id text, provider_stage text, progress jsonb not null default '{}',
 completion_started boolean not null default false, cancel_requested boolean not null default false,
 error_code text, error_message text, attempts integer not null default 0,
 worker_id text, lease_expires_at timestamptz,
 created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
 expires_at timestamptz not null default now()+interval '24 hours'
);
create index video_jobs_queue on public.video_jobs(status,created_at);
create index video_jobs_owner on public.video_jobs(user_id,created_at desc);
create table public.usage_counters (
 user_id uuid not null references auth.users(id) on delete cascade, usage_date date not null,
 submitted_jobs integer not null default 0, completed_jobs integer not null default 0,
 uploaded_bytes bigint not null default 0, processed_bytes bigint not null default 0,
 primary key(user_id,usage_date)
);
create table public.job_events (
 id bigint generated always as identity primary key, job_id uuid not null references public.video_jobs(id) on delete cascade,
 event_type text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.api_rate_limits (
 user_id uuid not null references auth.users(id) on delete cascade, window_start timestamptz not null,
 requests integer not null default 1, primary key(user_id,window_start)
);
alter table public.profiles enable row level security;
alter table public.video_jobs enable row level security;
alter table public.usage_counters enable row level security;
alter table public.job_events enable row level security;
alter table public.api_rate_limits enable row level security;
revoke all on public.profiles,public.video_jobs,public.usage_counters,public.job_events,public.api_rate_limits from anon,authenticated;
grant usage on schema public,auth to forged_web,forged_worker;
grant execute on function auth.uid() to forged_web;
grant select,insert,update,delete on public.video_jobs,public.usage_counters,public.api_rate_limits to forged_web;
grant select,insert on public.profiles to forged_web;
grant select,insert on public.job_events to forged_web;
grant select,update,delete on public.video_jobs,public.usage_counters to forged_worker;
grant select,insert,delete on public.job_events to forged_worker;
grant select,delete on public.api_rate_limits to forged_worker;
grant usage,select on sequence public.job_events_id_seq to forged_web,forged_worker;
create policy web_profiles on public.profiles for all to forged_web using(id=auth.uid()) with check(id=auth.uid());
create policy web_jobs on public.video_jobs for all to forged_web using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy web_usage on public.usage_counters for all to forged_web using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy web_rates on public.api_rate_limits for all to forged_web using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy web_events on public.job_events for all to forged_web using(exists(select from public.video_jobs j where j.id=job_id and j.user_id=auth.uid())) with check(exists(select from public.video_jobs j where j.id=job_id and j.user_id=auth.uid()));
create policy worker_jobs on public.video_jobs for all to forged_worker using(true) with check(true);
create policy worker_usage on public.usage_counters for all to forged_worker using(true) with check(true);
create policy worker_events on public.job_events for all to forged_worker using(true) with check(true);
create policy worker_rates on public.api_rate_limits for all to forged_worker using(true) with check(true);
-- No provider tokens or API keys are stored in PostgreSQL.
