# Oracle worker deployment

Deployed to the `forged-worker` Always Free Ampere VM in Oracle UK South (London), using Ubuntu 24.04, 1 OCPU and 6 GB RAM. The live Vercel client test passed on 1 November 2026: sign in, upload a generated sample, optimize through TikQuick on Oracle, download, validate playback and delete. Automatic container crash recovery was also verified. The local PC worker was stopped for this test.

Use an Always Free eligible Ubuntu VM with sufficient disk space for the image and temporary videos. Install Docker Engine and its Compose plugin from Docker's official Ubuntu repository. Enable Docker at boot with `sudo systemctl enable --now docker`.

Keep the worker's environment in `/etc/forged/worker.env` (root owned, mode 600) and the public Supabase CA in `/etc/forged/supabase-root.crt` (mode 644). Copy only worker database, TikQuick, R2 and required runtime variables. Do not copy frontend credentials or test-user credentials. The database URL must use the session pooler on port 5432 because the worker uses session advisory locks.

From the source root run:

```sh
sudo docker compose -f deploy/oracle/compose.yaml build
sudo docker compose -f deploy/oracle/compose.yaml up -d
sudo docker compose -f deploy/oracle/compose.yaml ps
curl --fail http://127.0.0.1:8080/healthz
```

The health endpoint binds to VM loopback only. The worker polls the shared database, so Vercel needs no inbound connection to this VM. Restrict SSH ingress to the administrator's IP. Do not publish port 8080 in Oracle security rules.

Verify database heartbeat, private R2 access, provider reachability and a complete authorized test optimization. Then restart the container and reboot the VM to confirm recovery. Docker restarts exited containers automatically; an unhealthy healthcheck alone does not restart a running container.

Keep `.env` files, SSH keys and deployment bundles out of Git and Docker build context. Review and commit deployment changes only after live verification, or after explicit approval.
