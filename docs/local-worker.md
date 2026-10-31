# Local worker on Windows

Run the worker from your repository checkout. It uses the existing Supabase queue and private R2 bucket. The Vercel frontend can submit jobs while the worker is running locally. There is no tunnel or inbound port-forwarding requirement.

Copy `.env.example` to the Git-ignored `.env` and configure the worker credentials. Do not commit it. `WORKER_DATABASE_URL` may be supplied directly using the `forged_worker` role and direct/session pooling. Otherwise the launcher composes it in memory from `SUPABASE_PROJECT_REF`, `SUPABASE_POOLER_HOST`, and `WORKER_DATABASE_PASSWORD`, using session port 5432 and certificate verification. Set `WORKER_BIND_HOST=127.0.0.1` for local operation.

Set `SUPABASE_CA_CERT_PATH` to your downloaded public production CA bundle, for example under `.tmp/certs`. Obtain it from Supabase's database settings or its official CLI repository. It is used only for this database connection. Hostname and certificate verification remain enabled; Windows trust settings do not need changing.

Install FFmpeg and FFprobe using a Windows build distributor linked by ffmpeg.org and verify the published checksum. You can keep them under the ignored `.tmp/tools` folder. Set `FFMPEG_PATH` and `FFPROBE_PATH` in `.env` to their executable paths, or leave them empty when both programs are on PATH.

Start in PowerShell from this directory:

```powershell
.\Start-Worker.ps1
```

This first checks a generated test video, restricted database access, private storage write/read/delete, and provider health. It then starts a hidden background worker. The health endpoint is bound to loopback at `http://127.0.0.1:8080/healthz`. The PID record and logs are under `.tmp/worker`.

For visible logs, use `npm run worker` in a terminal instead. Close it with Ctrl+C for graceful shutdown. Do not start both launch modes together.

To stop the hidden worker, use `Stop-Worker.ps1` when no video is processing. Windows process termination can interrupt a job; the queue's recovery rules will report an unknown completion outcome instead of retrying one-time provider completion.

No startup task or changes to Windows sleep settings are installed. Keep the PC awake and connected during processing. Jobs are subject to the app's 24-hour expiry while the PC is off. R2 lifecycle cleanup must also be configured independently of this worker.

Local media validation and mocked provider tests do not prove a real TikQuick transformation. The final check is to upload a small MP4 through the website, wait for validated completion, download the result, and play it.

During setup, both generated test videos were accepted by TikQuick and returned binary responses, but their outputs failed strict FFmpeg playback validation. The local worker reports this as `OUTPUT_INVALID` and withholds the result. See `local-worker-validation.md` for the observed limitation.
