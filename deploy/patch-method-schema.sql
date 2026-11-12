alter table public.video_jobs add column if not exists patch_method text not null default 'orion' check (patch_method in ('orion','luna'));
