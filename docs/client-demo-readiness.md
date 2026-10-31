# Client demo readiness — 31 October 2026

Production URL: https://forged-gamma.vercel.app

**The site is not yet accepted as a working upload-to-download demo.** Public pages work, but authenticated production operations and successful provider output still need acceptance.

## Verified

- All six public pages return HTTP 200; no browser runtime exceptions were observed.
- Eight desktop/mobile browser tests passed against production: navigation, optional encoder default, file selection/type validation, original preview, account forms, privacy controls, and denial of unauthenticated API requests.
- Vercel production is READY at commit `89af6af`; the audit fixes below have not yet been released.
- Local worker health returns HTTP 200. It remains dependent on this PC being awake and online.
- Supabase tables have RLS and the security advisor returns no findings.
- The previously passwordless `forged_web` login now authenticates through transaction pooling with verified TLS and no administrator privileges.
- Production database connection, public CA bundle, bucket endpoint/name, and quota settings were saved to Vercel. A new deployment is required to consume them.
- Typecheck, lint, production build, and 20 unit tests passed after the database TLS change; four disposable-database tests were skipped.

## Remaining release gates

| Gate                                    | Evidence and required action                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel storage credentials              | At audit time neither `R2_ACCESS_KEY_ID` nor `R2_SECRET_ACCESS_KEY` existed. Add the separate bucket-scoped Vercel credentials as production secrets. The local worker credentials remain local.                                                                                                                                                                                                                                                                                   |
| Release serverless TLS support          | `SUPABASE_CA_CERT_PEM` is now supported by the web database helper. Publish this code and rebuild production after its secrets are complete. The CA is public; database passwords must remain secret.                                                                                                                                                                                                                                                                              |
| Client login                            | No Supabase users existed at audit time. Email confirmation is enabled. Verify custom SMTP and the production site/redirect URLs for public signup; Supabase's built-in email delivery only supports organization team addresses. For a private demo, create a dedicated confirmed account through Supabase Authentication → Users → Add user → Create user, without sending an invitation.                                                                                        |
| TikQuick standard processing            | Two fresh main-host synthetic jobs returned binary files, but both failed FFmpeg decoding, including a relaxed diagnostic decode (exit 69). Results remain withheld as `OUTPUT_INVALID`. A separate fresh job on the documented alternative host accepted initialization/chunks but returned HTTP 404 at completion. Obtain provider clarification or a known-good supported sample. Do not repeat completion for an existing session or remove validation to manufacture success. |
| Optional preprocessing                  | Implemented, default off, mocked contract tests pass; no live encoder-to-patched-download success is recorded. Test after standard output is resolved.                                                                                                                                                                                                                                                                                                                             |
| Authenticated isolation and lifecycle   | Verify real login, direct browser upload, sealed source, explicit start, refresh/polling, download/playback, history, cancellation, deletion, quota and two-account isolation. No successful production journey is claimed yet.                                                                                                                                                                                                                                                    |
| Worker availability and storage cleanup | Local mode is sufficient only while this PC runs. Before an unattended release, provide a continuously available worker and verify R2 expiry/multipart lifecycle rules.                                                                                                                                                                                                                                                                                                            |

Chrome playback additionally confirmed the output issue: the original five-second sample played to completion with 150 frames, while TikQuick's output stopped with `MEDIA_ERR_DECODE` at 4.777 seconds after 145 frames. This is not solely a strict FFmpeg validation failure.

## Reproducible browser acceptance

Public production checks, without starting a local web server:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://forged-gamma.vercel.app'
node node_modules/@playwright/test/cli.js test tests/e2e/studio.spec.ts
```

For the real client journey, fill the ignored `.env.demo.local` with a dedicated confirmed account's `E2E_EMAIL` and `E2E_PASSWORD`, an owned `E2E_SAMPLE_PATH`, `PLAYWRIGHT_BASE_URL`, and `LIVE_CLIENT_TEST=true`. Use a generated sample rather than client footage. Run from the repository root:

```powershell
node --env-file=.env --env-file=.env.demo.local node_modules/@playwright/test/cli.js test tests/e2e/client-flow.spec.ts --project=desktop
```

This submits one real job, checks refresh recovery, saves the download under ignored test results, fully decodes it with FFmpeg, verifies history, and requests deletion of that test video. It fails on a failed provider result. Authentication traces, screenshots and videos are disabled for this test. Passing the public checks alone is not client acceptance. The test account and generated sample should be removed after acceptance.

References: [Supabase email delivery](https://supabase.com/docs/guides/auth/auth-smtp), [TikQuick provider contract](https://tikquick.online/thirdparty-apidocs.txt), and [local worker instructions](local-worker.md).
