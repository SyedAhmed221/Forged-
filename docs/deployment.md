# Deployment runbook

The target is Vercel + Supabase + private Cloudflare R2 + Railway. Deployments need your accounts, billing choices, repository connection, and secrets. This repository does not provision accounts automatically.

## 1. Supabase

1. Create a Supabase project. Enable email/password authentication and email confirmation. Configure production SMTP for reliable confirmation delivery.
2. In Authentication → URL Configuration, set Site URL to your HTTPS Vercel domain. Allow redirects to `https://YOUR_DOMAIN/dashboard` and your local development dashboard. Do not add wildcard production callback hosts.
3. Run `supabase/migrations/202610300001_initial.sql` in the SQL editor as administrator. The migration creates `forged_web` and `forged_worker` restricted login roles without passwords.
4. Set different random passwords for the two roles through your secure SQL administration session: `alter role forged_web password '<unique password>';` and the corresponding `forged_worker` statement. These are templates; never commit passwords or paste them into logs. URL-encode passwords in connection strings.
5. Build `DATABASE_URL` using the transaction pooler endpoint for `forged_web`. Build `WORKER_DATABASE_URL` using the direct database endpoint or session pooler for `forged_worker`. Supabase pooler usernames include the role and project reference; use the dashboard connection details for your region. Enable certificate verification (`sslmode=verify-full`), including the Supabase CA if your environment requires it. **Never use transaction pooling for the worker**: its advisory locks require one pinned database session.
   For Vercel, put the public CA bundle contents in `SUPABASE_CA_CERT_PEM`; the web database connection uses these certificates with hostname verification. Do not reference a certificate file on your PC in Vercel's connection URL. The local worker continues to use `SUPABASE_CA_CERT_PATH`.
6. Copy the project URL and publishable/anon key to the two `NEXT_PUBLIC_SUPABASE_*` variables. The application does not need the Supabase service-role key. Do not give either database role superuser, `BYPASSRLS`, or membership in admin roles.

Users cannot query or modify these tables directly through the public Supabase Data API. Authenticated application routes obtain a verified Supabase user, set transaction-local identity, and operate under the restricted RLS role. Worker credentials can access job operations and usage but cannot administer authentication or profiles.

## 2. R2

1. Create a private bucket. Disable public bucket URLs and public custom-domain access.
2. Create separate bucket-scoped read/write R2 API credentials for Vercel and Railway. Set the S3 API endpoint `https://ACCOUNT_ID.r2.cloudflarestorage.com`, bucket name, access key, and secret.
3. Configure CORS with your exact Vercel origin (and localhost only for local testing):

```json
[
  {
    "AllowedOrigins": ["https://YOUR_DOMAIN"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "content-length", "x-amz-*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

4. Add lifecycle rules: expire `pending/` objects after one day; expire `source/` and `output/` after two days as an outage backstop; abort incomplete multipart uploads after one day. The worker normally deletes objects and job records at 24 hours (within its next cleanup cycle). Lifecycle expiration is a fallback, not a substitute for the worker.
5. Browser PUT URLs expire in ten minutes and are scoped to a random user/job key and declared size. The server verifies size, copies into a sealed source key with an ETag precondition, and only then makes the job startable. Reusing a PUT URL can only replace the pending object, not the queued source. A pending object recreated after deletion is caught by the lifecycle rule.

## 3. Vercel

1. Push the repository to your chosen Git host and import it into Vercel.
2. Set Root Directory to `apps/web`. Enable inclusion of files outside the root directory. Framework: Next.js. Install command: `npm ci --prefix ../..`. Build command: `npm run build -w @tikquick/web`. Node: 22.x. The checked-in `apps/web/vercel.json` supplies the commands.
3. Configure only the web variables: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, R2 variables, `MAX_INPUT_BYTES=262144000`, and `DAILY_JOB_LIMIT=10`. Public variables must be present at build time.
4. **Do not set `TIKQUICK_API_KEY` or `WORKER_DATABASE_URL` on Vercel.** `SUPABASE_SERVICE_ROLE_KEY` is reserved in the example but unused; leave it unset.
5. Deploy. Verify `/`, `/login`, `/dashboard`, `/optimize`, `/history`, and `/settings`. All uploads and downloads travel directly between the browser and R2; no video request body goes through a Vercel function. The completion route only verifies and copies R2 objects and has a 60-second ceiling.
6. The CSP permits standard Supabase and R2 hostnames. If you adopt a custom service endpoint, explicitly update the CSP `connect-src` list and R2 CORS together.

## 4. Railway

1. Create a service from the same repository with repository root as build context. `railway.json` points to `services/worker/Dockerfile`. It installs FFmpeg/FFprobe and runs as the non-root Node user.
2. Set `WORKER_DATABASE_URL`, worker R2 credentials, `TIKQUICK_API_KEY`, the provider URLs, chunk configuration, output limit, and a random `INTERNAL_HEALTH_TOKEN`. Leave public web auth keys and the web database credentials out of this service.
3. Start with one replica, one provider job at a time, 1 GiB RAM and at least 3 GiB temporary disk; measure real media workloads before raising the 250 MiB input limit. Encoding is remote, but full decode validation uses local CPU/disk. Extra replicas currently act as safe standbys behind the shared provider advisory lock. Chunk concurrency remains two.
4. Configure `/healthz` as the healthcheck. It returns 503 when the last database cycle failed or shutdown began. Configure a graceful termination window of at least 30 seconds. SIGTERM aborts local work; one-time completion remains non-retryable.
5. Configure alerts for unhealthy workers, jobs waiting over five minutes, repeated `COMPLETION_UNKNOWN`, R2 errors, and cleanup lag. Use structured event codes and job IDs only, never full request URLs or raw provider responses.
6. Call `GET /internal/provider-health` with the internal bearer token from your monitoring system. Do not put that token in a browser. The worker caches the provider result for 60 seconds; it does not use the TikQuick API key.

## 5. Release gate

Follow [acceptance.md](acceptance.md) with a small owned sample video. Run the standard route first, including upload, worker processing, download, and playback. Then test the optional encoder. Verify two-account isolation, cancel/delete, expiration, and an interrupted worker before inviting users. Record actual deployment URLs and test results in your release record; do not treat mocked CI as a live integration test.
