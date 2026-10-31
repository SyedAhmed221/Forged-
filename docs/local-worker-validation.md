# Local worker validation — 31 October 2026

The worker is running in a hidden local Node.js process, with the health endpoint bound to `127.0.0.1:8080`. A live health request returned HTTP 200 with `{"ok":true}`.

Verified successfully:

- Locked Node dependencies installed from the uploaded GitHub repository.
- FFmpeg/FFprobe Windows build downloaded from the distributor linked by ffmpeg.org and checked against the published SHA-256 checksum.
- Generated local video/audio sample passed metadata inspection and full decoding.
- Supabase session-pooler connection authenticated as `forged_worker`, using certificate and hostname verification with the official Supabase production CA certificates.
- Private R2 object write, read, size/content comparison, and deletion succeeded.
- Browser upload CORS preflight returned HTTP 204 and allowed `https://forged-gamma.vercel.app` with PUT, GET, and HEAD.
- TikQuick health reported online, and a fresh OTU response validated the configured API key.
- Typecheck, lint, and 19 automated tests passed. Four disposable-database tests were skipped; the live database connection check above is a separate check.

## Live provider output limitation

Two independent standard PS jobs were submitted, each using a fresh session and exactly one POST completion request:

1. Generated one-second, 320×240, 10 fps H.264/AAC MP4.
2. Generated five-second, 720×1280, 30 fps H.264/AAC MP4.

Both uploads and binary completion responses succeeded. The returned files were saved locally under the ignored `artifacts/` directory. Both failed the configured strict FFmpeg full-decode check. The first output's decoder reported `missing picture in access unit`, `no frame!`, and invalid H.264 packets. Its MP4 metadata remained readable; readable metadata and HTTP success do not establish a valid output.

The processing path has therefore **not passed end-to-end acceptance**. The worker keeps validation enabled and reports `OUTPUT_INVALID` rather than offering an unvalidated download. No completion request was repeated. No personal video was used. The optional encoder was not tested because the standard path has not passed acceptance.

Provider clarification or a known-good real sample is needed to establish whether these decoder errors are an intended characteristic of patched output and what supported validation should be used. The patching algorithm and returned files have not been modified to hide the errors.

## External frontend status

Vercel team authorization is still required through the connector to inspect or change its server-side environment configuration. The worker's local health, database, storage, and provider checks do not prove that Vercel's `DATABASE_URL` and application account flow are configured correctly. No browser-to-download success is claimed.

The deployed `/api/usage` endpoint now returns HTTP 401 `UNAUTHENTICATED` without a bearer token, confirming that the frontend's public Supabase configuration is present. An authenticated upload flow remains to be tested.
