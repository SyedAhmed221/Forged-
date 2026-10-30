# Forged

A private video optimization workspace built with Next.js App Router, TypeScript, Tailwind, shadcn-style UI primitives, Supabase Auth/PostgreSQL, Cloudflare R2, and a Railway worker. TikQuick supplies the actual processing algorithm. TikTok publishing is not implemented.

## Start locally

Requires Node.js 22.12 or newer. The worker also requires FFmpeg and FFprobe on PATH (included in its Docker image).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. All pages render without credentials; service actions clearly report missing configuration. There is no simulated production backend and no fake processing history.

Copy `.env.example` to `apps/web/.env.local` for the web server and to `.env` for the worker. Configure the services following [deployment instructions](docs/deployment.md), then run `npm run worker` in another terminal.

## Structure

- `apps/web`: landing, dashboard, upload/preview, history, settings, account UI, authenticated APIs
- `services/worker`: durable queue consumer, TikQuick integration, streaming output, FFprobe/FFmpeg validation
- `packages/shared`: validation, public types, chunk arithmetic, private R2 operations
- `supabase/migrations`: restricted database roles, tables, RLS
- `tests`: mocked provider/storage/API tests, real PostgreSQL integration suite, desktop/mobile Playwright flows
- `docs`: deployment, security, provider contract, operations, acceptance checklist

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

The database suite runs only when `TEST_DATABASE_URL` points to a disposable PostgreSQL database. CI creates PostgreSQL 17 and runs the suite. Never point it at Supabase production.

`npm run test:live` is explicitly opt-in. Set `LIVE_TIKQUICK_TEST=true`, `LIVE_SAMPLE_PATH`, and the worker API key in your private `.env`. This submits a real sample to TikQuick. It validates the downloaded result with FFprobe and a full FFmpeg decode; it does not replace the deployed browser-to-R2 acceptance test.

## Implementation status

The application, worker, optional encoder, migrations, tests, and deployment configuration are implemented. Live deployment, Supabase login, R2 upload/download, and real TikQuick processing must be verified with configured accounts. See [acceptance checklist](docs/acceptance.md). No successful cloud deployment or live provider processing is claimed.

Local verification: production build, typecheck, lint, formatting, 23 backend tests (including real PostgreSQL), and 8 desktop/mobile browser tests passed. See the [validation record](docs/validation.md).

The provider contract was retrieved and read in full from [TikQuick's documentation](https://tikquick.online/thirdparty-apidocs.txt) on 30 October 2026. See [contract and recovery notes](docs/provider-contract.md).
