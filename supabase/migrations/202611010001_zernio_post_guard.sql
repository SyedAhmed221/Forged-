-- A completed video may be submitted to TikTok at most once. A timeout after
-- this event is deliberately treated as an unknown outcome, avoiding duplicate posts.
create unique index if not exists job_events_one_zernio_submission
on public.job_events(job_id) where event_type='zernio_publish_started';
