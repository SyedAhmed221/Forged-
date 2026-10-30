# Operations

The database is the queue. Each claim uses `FOR UPDATE SKIP LOCKED`, a job advisory lock, a deployment-wide provider slot, a worker identity, and a renewable lease. Session locks are mandatory; use direct PostgreSQL or session pooling for Railway. One job is active globally. Increase throughput only by implementing coordinated extra slot IDs and confirming the provider account's concurrency allowance.

The worker renews its 60-second lease every ten seconds. Database connection errors or cancellation abort active network work. Stale pre-completion jobs restart with a fresh provider session up to three attempts. Token-consuming completion attempts are fenced permanently for that job. See [provider-contract.md](provider-contract.md).

Operator queries (administrator session):

```sql
select status, count(*) from video_jobs group by status;
select id, created_at, provider_stage, attempts, lease_expires_at
from video_jobs where status in ('queued','processing') order by created_at;
select error_code, count(*) from video_jobs
where created_at > now() - interval '1 day' group by error_code;
select count(*) as overdue_cleanup from video_jobs where expires_at < now();
```

Alert on queue age over five minutes, lease age over two minutes, a worker healthcheck failure, increasing failure codes, and overdue cleanup. Never reset `completion_started` to force a retry. The user can create a distinct job if they choose to submit again. A crash after output upload but before the completion transaction is still unknown; deterministic output keys are removed on job deletion/expiry.

Cleanup runs at most once a minute between jobs and skips any job still held by a worker lock. A long-running job can delay the cleanup cycle; R2 lifecycle rules provide an independent backstop. For strict deletion deadlines, run an additional worker replica as a cleanup/standby instance. Deleted job events cascade; aggregate usage remains. A worker outage also delays history cleanup, so monitor it explicitly.

Graceful shutdown aborts current work and removes temporary files. Hard process death discards container ephemeral disk on replacement; do not use persistent mounts for temporary video data. Incomplete R2 multipart uploads require the configured one-day abort lifecycle rule. Provision enough temporary disk for one source and one output (default maximums 250 MiB + 1 GiB), plus validation overhead.

Provider health uses a short timeout, one in-flight request, and a 60-second cache behind an internal bearer token. It is a reachability check, not proof that an authenticated processing request will succeed.

Back up PostgreSQL according to your recovery objective. Video files are intentionally ephemeral; do not promise restoration after deletion. Restore or rotate credentials through service secret stores, never checked-in environment files. If a provider key leaks, rotate it with TikQuick and invalidate affected credentials rather than attempting to scrub only application logs.
