# Client demo readiness — 31 October 2026

Production URL: https://forged-gamma.vercel.app

**The TikQuick validation failure has been traced to its synthetic trailing samples. The worker now validates the real video/audio and preserves the exact patched artifact for download. Ordinary player compatibility and TikTok compression outcomes are separate checks.**

## Fixed and deployed

Commit `e4e5ad88fb2674ba9a0ca77eeef89291aee7d52b` is deployed in production, Vercel deployment `dpl_xusa5bXZL2v5E42SCNCYNc8K9FKC`, status READY.

- Configured the restricted `forged_web` database login and verified transaction-pooler access without administrator privileges.
- Added serverless public CA bundle support with certificate and hostname verification.
- Saved the database connection, CA bundle, bucket endpoint/name, quotas and file limit in Vercel production. The user added the separate Vercel R2 credentials.
- Added an explicitly enabled authenticated browser acceptance test. Credentials remain in ignored local files; authentication traces/screenshots/video recordings are disabled.
- Supabase security advisors report no findings.

## Live browser results

After the fix, the production browser acceptance test passed in 55.9 seconds: dedicated-account sign-in → R2 upload → explicit start → refresh → TikQuick processing → download → local content validation → history deletion. Only generated footage was used.

| Feature                                                 | Result                                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public pages and mobile layout                          | All six pages HTTP 200; eight desktop/mobile browser tests passed.                                                                                          |
| Confirmed demo account sign-in                          | Passed with the dedicated account created by the user.                                                                                                      |
| Dashboard and usage                                     | Authenticated job-list and usage APIs returned HTTP 200; dashboard rendered.                                                                                |
| Direct browser upload to private R2                     | Passed with a generated five-second portrait MP4.                                                                                                           |
| Upload sealing and explicit start                       | Passed; the worker claimed the queued job.                                                                                                                  |
| Refresh and status polling                              | Passed; reloaded studio reached completion.                                                                                                                 |
| Standard provider processing                            | Passed after content-aware validation; unchanged patched output published.                                                                                  |
| Video history and account settings                      | Passed; the failed job and correct account were displayed.                                                                                                  |
| Delete video                                            | Passed through the history UI. The generated job disappeared and a database check confirmed its row was removed.                                            |
| Download and content validation                         | Passed in the live browser flow; all real video/audio decodes. Patched timing samples remain incompatible with some ordinary players.                       |
| Optional preprocessing                                  | Earlier 9,340,600-byte live encoder output now passes content validation. End-to-end browser check used preprocessing off.                                  |
| Public signup/email delivery                            | Not verified. Email confirmation is enabled; configure/verify custom SMTP and exact production redirect URLs before allowing arbitrary client registration. |
| Two-account isolation, cancellation and outage recovery | Automated coverage exists for parts of these paths; complete live acceptance remains outstanding.                                                           |

The generated end-to-end job was `2a9ed707-9813-4809-a105-c567f6b5bd5e`. It was deleted after the checks. No client footage was used.

## TikQuick validation correction

The initial strict decoder rejected both standard and encoder results, and Chrome stopped near the end. Packet-level inspection established why: TikQuick v23 adds repeated references to an eight-byte empty H.264 NAL (`0000000400000000`) after the real samples. The five-second file contains 150 real video packets followed by 850 synthetic references. This is a nonstandard patched container, not evidence that its real frames were damaged.

`inspectProviderMedia` first attempts ordinary full decoding. On failure it permits only H.264 with a trailing suffix of eight-byte packets all referencing the same exact empty NAL. It stream-copies a disposable validation file excluding those placeholders, fully decodes video/audio, and confirms that every real video packet produced a frame. Other corruption remains an error. The downloadable R2 object is never rewritten or re-encoded.

All three earlier failed synthetic outputs now pass this content validation, including the 9,340,600-byte encoder result. For the standard five-second result, all 150 video packet payload hashes and all 236 audio packet payload hashes match the original input exactly. The encoder option performs actual re-encoding; leave it off for the quality-preserving patch flow. The UI identifies the optional encoder and explains the patched file's player compatibility.

The guide's API request sequence still matches our implementation. The optional encoder's live origin is `https://vapi.tikqcapi.site`, which is allowlisted. RTXFury uses its own `/api/patch-rtx` backend and does not expose an alternative TikQuick request sequence.

This validates the delivered content and unchanged patch. It does not establish that TikTok will bypass compression. A manual upload to an owned TikTok account is still needed to check acceptance and resulting platform quality.

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

The test submits one real job, checks refresh recovery, downloads and validates the real video/audio while preserving TikQuick padding, verifies history and deletes that test video. Passing public checks alone is not client acceptance.

Typecheck, lint, changed-file formatting, 23 unit tests and eight public browser checks passed. Four disposable-database tests were skipped. Vercel's recent production error-log query returned no error logs; the provider failure was recorded by the local worker.

References: [Supabase email delivery](https://supabase.com/docs/guides/auth/auth-smtp), [TikQuick provider contract](https://tikquick.online/thirdparty-apidocs.txt), and [local worker instructions](local-worker.md).
