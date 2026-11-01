# Deployment verification

Date: 1 November 2026 (UTC / Europe London)

- Oracle VM: `forged-worker`, UK South London, Ubuntu 24.04, Ampere A1, 1 OCPU / 6 GB RAM.
- Container: `oracle-worker-1`, built from the local source with the updated byte PS endpoint.
- Worker database uses the Supabase session pooler with certificate verification.
- Runtime environment is stored outside the source and image at `/etc/forged/worker.env`, root owned with mode 600.
- SSH ingress is restricted to the deployment PC's public IPv4 address. Update the rule if that address changes.
- Health port 8080 is published only on VM loopback.
- Docker is enabled at boot; container restart policy is `unless-stopped`.
- Live deployed browser test: 1 passed in 45.5 seconds. Covered authenticated upload, Oracle optimization, download, full playback validation and deletion using a generated video.
- Local worker PID 1120 was stopped before the live test.
- Crash recovery: terminated the worker child process; Docker restart count increased to 1 and health returned OK.
- VM reboot recovery: Docker started automatically, the worker returned healthy and `/healthz` returned `{"ok":true}`. Verified the health listener remains bound to `127.0.0.1:8080`.

The SSH private key is stored locally in the ignored `.tmp/oracle` directory. Back it up securely; never commit it.
