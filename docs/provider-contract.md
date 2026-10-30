# Provider contract and recovery

Source: https://tikquick.online/thirdparty-apidocs.txt, retrieved 30 October 2026. Production hosts are explicitly allowlisted in `services/worker/src/providers/tikquick.ts`; HTTPS, standard ports, no credentials, no origin paths, and no redirects are required. The documented alternative PS host `tqps.mikeden.site` is permitted only when explicitly configured, not used for automatic failover mid-job.

Standard flow: mint a fresh `genotu` token, initialize with real filename/size/chunk count, upload binary chunks with indices starting at zero, then POST completion. The completion response is binary and is streamed to multipart R2 storage. Chunk size defaults to 20 MiB and cannot exceed it; concurrency is capped at two, with at most five attempts. Only connection failures, 408, 429, and 5xx responses are retryable. Committed byte counts advance after each successful chunk. These are not socket-level instantaneous progress.

The sample `expires_at` has no timezone. The implementation defaults to UTC, accepts explicit timezone offsets, and allows `TIKQUICK_TOKEN_TIMEZONE_OFFSET` to be configured after confirmation with TikQuick. This ambiguity must be resolved during live onboarding. A fresh token is always minted immediately before its session; expired tokens are rejected. Tokens stay in worker memory and never enter PostgreSQL or application logs.

Encoder flow: fresh `genenc`, approved returned encoder origin, POST `/api/make`, 5 MiB binary chunks starting at one, POST finish, then streaming SSE. The actual setup event name is `setting_up_env`. Both LF and CRLF frames are supported; malformed JSON is skipped, and only genuine rendering percentages are shown. There are up to four SSE connections with bounded backoff and no replay assumption. The decoded output URL must match the approved HTTPS encoder origin and `/out/{UUID}.mp4` exactly, without credentials, query, or fragment. Handoff mints a fresh PS token, initializes `{filename: '<enc_id>.mp4', total_size: 1, total_chunks: 1}`, and calls GET completion with `enc_id`.

Recovery rules:

1. A worker holds session-level advisory locks for the provider slot and its job, plus a renewable 60-second row lease. A live lock holder cannot be reclaimed even after lease expiry.
2. Before completion, a crashed job can restart with a fresh provider session, at most three attempts. Partial provider sessions are never resumed; there is no documented query/resume API.
3. `completion_started` is persisted before sending either completion request. Once persisted, a crash yields `COMPLETION_UNKNOWN`, even if the request might not have reached TikQuick. This deliberately prefers a reported uncertainty over duplicate completion.
4. A completion request is never automatically repeated. An interrupted, invalid, or partial output is deleted locally and never offered for download. The user may explicitly create a new job.
5. Cancelling aborts local transfers and prevents publishing a result. The contract does not provide provider cancellation; already-started provider work may continue.

The full processing request has a 30-minute bound; worker jobs have a 60-minute bound; output transfers fail after 120 seconds without data. SSE connections have a 20-minute bound and bounded reconnections. Output is limited to 1 GiB by default. FFprobe validates the container and tracks; FFmpeg fully decodes output video and optional audio before success is committed. Health calls use the unauthenticated `/api/psver`, cache for 60 seconds, and coalesce concurrent requests.
