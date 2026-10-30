# Local validation — 30 October 2026

Completed on Windows with Node.js 22.13.1:

| Check                                    | Result                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| TypeScript                               | Passed                                                             |
| ESLint                                   | Passed                                                             |
| Prettier                                 | Passed                                                             |
| Next.js production build                 | Passed; all UI pages and API routes generated                      |
| Vitest, including real PostgreSQL        | 23 passed across 7 files                                           |
| Playwright against the production server | 8 passed: desktop Chromium and mobile Chromium                     |
| Visual review                            | Landing, desktop upload studio, and mobile upload studio inspected |

Database tests ran against a temporary PostgreSQL 18.6 instance bound only to loopback, which was stopped afterwards. They exercised the actual migration, cross-account RLS, concurrent quota reservation, advisory locks, worker claiming, stale pre-completion restart, and refusal to repeat an ambiguous completion. The runtime was downloaded into the ignored `.tmp/` directory; it is not an application dependency. CI is configured separately for PostgreSQL 17 and has not been run on a hosted Git service in this session.

Provider and S3 tests use mocks. They cover standard and encoder request shapes, raw chunk bytes, partial final chunks, concurrency, retries, permanent failures, one-time completion, SSE, encoder URL checks, streaming storage, and incomplete-output cleanup. No real TikQuick video was submitted. No cloud resources were provisioned, and no live Supabase login or R2 transfer was verified. Full FFmpeg playback validation is implemented in the worker but still needs the live release gate with an actual sample.

Production screenshots are saved locally in `artifacts/landing-desktop.png`, `artifacts/optimize-desktop.png`, and `artifacts/optimize-mobile.png` (ignored by Git). Use `npm run dev` to launch the workspace again.
