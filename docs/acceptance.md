# Release acceptance record

Local implementation and cloud acceptance are different checks. Fill these boxes only after actual execution in the deployed environment.

## Automated

- [ ] `npm ci`, typecheck, lint, format check, tests, production build
- [ ] PostgreSQL integration tests against a disposable test database (`TEST_DATABASE_URL`)
- [ ] Playwright desktop and mobile tests

Provider tests mock HTTP responses; storage tests mock S3. The standard upload-to-download test verifies raw byte chunking, transient retries, concurrency, one completion request, and binary output streaming. It does not prove that the provider transformed a real video. FFprobe schema tests reject invalid metadata; real output decode requires FFmpeg and a real sample.

## Deployment and live integration (not yet performed)

- [ ] Vercel URL and successful production deployment recorded
- [ ] Railway image built and worker healthy
- [ ] Supabase migration applied, restricted credentials verified, email signup/login verified
- [ ] R2 private bucket, exact-origin CORS, lifecycle and multipart cleanup configured
- [ ] Upload a small MP4: browser sends bytes directly to R2 and shows measured progress
- [ ] Source size is verified and sealed, then explicit Start queues the job
- [ ] Worker FFprobe metadata matches the source; fresh OTU, PS init and 0-based chunk upload succeed
- [ ] Standard POST completion streams to R2, nonzero output is fully decoded, and completed status is committed
- [ ] Owner downloads the correct output and plays it; another account cannot access it
- [ ] Encoder enabled: 1-based chunks, SSE rendering progress, UUID validation, placeholder init, GET completion all succeed
- [ ] MOV input, partial final chunks, invalid media, and configured file size limit tested
- [ ] Refresh the page and interrupt network connectivity; polling resumes without restarting a job
- [ ] Cancel and delete queued/active/completed jobs; verify stored objects and job rows disappear
- [ ] Stop a worker before completion; a new worker obtains a fresh session and recovers
- [ ] Stop a worker after completion starts; the job reports unknown outcome without repeating completion
- [ ] Confirm timezone of naive `expires_at` with TikQuick; set offset accordingly
- [ ] Verify no credentials in browser bundles, responses, provider traces, or error monitoring
- [ ] Verify expiry, quota contention, alerts, and cleanup during an outage

Run live tests only with a video you have permission to send to TikQuick. `npm run test:live` requires explicit environment opt-in and supports `LIVE_USE_ENCODER=true`. For full acceptance, additionally run the deployed browser→R2→queue→worker→R2→download flow above.
