# Client demo readiness — 31 October 2026

Production URL: https://forged-gamma.vercel.app

**The application is live, but successful video processing and download are blocked by TikQuick's output. It is not yet accepted as a complete client demo.**

## Fixed and deployed

Commit `e4e5ad88fb2674ba9a0ca77eeef89291aee7d52b` is deployed in production, Vercel deployment `dpl_xusa5bXZL2v5E42SCNCYNc8K9FKC`, status READY.

- Configured the restricted `forged_web` database login and verified transaction-pooler access without administrator privileges.
- Added serverless public CA bundle support with certificate and hostname verification.
- Saved the database connection, CA bundle, bucket endpoint/name, quotas and file limit in Vercel production. The user added the separate Vercel R2 credentials.
- Added an explicitly enabled authenticated browser acceptance test. Credentials remain in ignored local files; authentication traces/screenshots/video recordings are disabled.
- Supabase security advisors report no findings.

## Live browser results

| Feature                                                 | Result                                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public pages and mobile layout                          | All six pages HTTP 200; eight desktop/mobile browser tests passed.                                                                                          |
| Confirmed demo account sign-in                          | Passed with the dedicated account created by the user.                                                                                                      |
| Dashboard and usage                                     | Authenticated job-list and usage APIs returned HTTP 200; dashboard rendered.                                                                                |
| Direct browser upload to private R2                     | Passed with a generated five-second portrait MP4.                                                                                                           |
| Upload sealing and explicit start                       | Passed; the worker claimed the queued job.                                                                                                                  |
| Refresh and status polling                              | Passed; the reloaded studio displayed the final processing failure.                                                                                         |
| Standard provider processing                            | Failed as `OUTPUT_INVALID`; no download was published.                                                                                                      |
| Video history and account settings                      | Passed; the failed job and correct account were displayed.                                                                                                  |
| Delete video                                            | Passed through the history UI. The generated job disappeared and a database check confirmed its row was removed.                                            |
| Download and full playback                              | Blocked by provider failure.                                                                                                                                |
| Optional preprocessing                                  | Live encoder, PS handoff and binary response succeeded with the corrected encoder origin; returned output still failed media validation.                    |
| Public signup/email delivery                            | Not verified. Email confirmation is enabled; configure/verify custom SMTP and exact production redirect URLs before allowing arbitrary client registration. |
| Two-account isolation, cancellation and outage recovery | Automated coverage exists for parts of these paths; complete live acceptance remains outstanding.                                                           |

The generated end-to-end job was `2a9ed707-9813-4809-a105-c567f6b5bd5e`. It was deleted after the checks. No client footage was used.

## Provider blocker

Two fresh standalone main-host synthetic jobs returned binary files, but both failed strict FFmpeg full decoding. A relaxed diagnostic decode also failed (exit 69). Chrome played the original five-second sample to completion with 150 frames; the corresponding returned output stopped with `MEDIA_ERR_DECODE` at 4.777 seconds after 145 frames. This is not solely an overly strict validation setting.

A separate fresh job on the documented alternative PS host accepted initialization/chunks but returned HTTP 404 at completion. The complete deployed browser → R2 → queue → worker → TikQuick journey reproduced `OUTPUT_INVALID`.

Obtain a provider correction or a known-good supported sample and validation requirements, then rerun standard processing and optional preprocessing. Do not repeat completion for an existing session, bypass validation, or offer an unvalidated file as a successful result.

## Provider comparison follow-up

The current TikQuick guide was rechecked and is unchanged. Its standard API sequence matches the worker. RTXFury's public patcher uses its own `/api/patch-rtx` endpoint and RTX engine; its page does not expose an alternative TikQuick request sequence. It recommends H.264 input, which our generated tests already used.

The optional TikQuick encoder initially failed because the live `genenc` response names `https://vapi.tikqcapi.site`, while the worker allowed and configured only the guide's older host. The exact new host was added to the allowlist and local configuration. A fresh synthetic encoder test then completed token creation, chunk upload, rendering, PS handoff and binary response, but the output still failed full media decoding. This fixes a separate optional-path configuration error; it does not establish a playable result. The standard provider output remains blocked.

## Availability

The local worker health check returns HTTP 200. The demo relies on this PC remaining awake and online. Before an unattended release, provide a continuously available worker and verify R2 expiry and incomplete-multipart lifecycle rules. For a private demonstration, the confirmed demo account avoids reliance on confirmation email delivery.

## Reproduce acceptance

Public production checks, without starting a local web server:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://forged-gamma.vercel.app'
node node_modules/@playwright/test/cli.js test tests/e2e/studio.spec.ts
```

For the real client journey, fill the ignored `.env.demo.local` with a dedicated confirmed account's `E2E_EMAIL` and `E2E_PASSWORD`, an owned `E2E_SAMPLE_PATH`, `PLAYWRIGHT_BASE_URL`, and `LIVE_CLIENT_TEST=true`. Run from the repository root:

```powershell
node --env-file=.env --env-file=.env.demo.local node_modules/@playwright/test/cli.js test tests/e2e/client-flow.spec.ts --project=desktop
```

The test submits one real job, checks refresh recovery, downloads and fully decodes a successful result, verifies history and deletes that test video. It currently fails at the provider result as expected; a separate live browser check verified history, settings and deletion. Passing public checks alone is not client acceptance.

Typecheck, lint, production build, changed-file formatting, 20 unit tests and eight public browser checks passed. Four disposable-database tests were skipped. Vercel's recent production error-log query returned no error logs; the provider failure was recorded by the local worker.

References: [Supabase email delivery](https://supabase.com/docs/guides/auth/auth-smtp), [TikQuick provider contract](https://tikquick.online/thirdparty-apidocs.txt), and [local worker instructions](local-worker.md).
