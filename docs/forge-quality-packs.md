# Forge Quality Packs

Forge Quality runs on Vercel with Next.js App Router. The existing optimiser uses Supabase Postgres, R2, and Stripe subscriptions. Packs has separate API routes, an isolated Postgres schema and login, its own private R2 bucket, Stripe hosted Checkout, and receipts over the Resend HTTP API.

Standard (£74) and Premium (£115) share the supplied 18-page PDF. It has been uploaded and checksum-verified in the private R2 bucket `forged-quality-packs`, object `max-quality/tiktok-max-quality-method-75ee9ca42914b447.pdf` (1,228,512 bytes). Premium adds the advertised personal support. The PDF includes the customer's download links, so its contents stay private. JAGO's £500 lifetime pack remains pending delivery assets and has an empty file key.

Configure the packs runtime with read-only credentials scoped to the dedicated bucket. The provisioning upload used the existing administrator storage credentials. Review the supplied final-purchase notice, digital-delivery consent, licence terms, support contact and booking process before opening sales.

## Configure a sandbox

1. In a non-production Supabase project, apply `supabase/migrations/20261117150641_forge_quality_packs.sql`. Set a password for the `forged_packs` role securely and provide its connection string as `PACKS_DATABASE_URL`. Use verified TLS and configure `PACKS_DATABASE_CA_CERT_PEM` if a separate CA bundle is needed. Keep the schema outside the project's exposed Data API schemas.
2. Create a private R2 bucket for pack archives. Scope the runtime credentials to reading that bucket. Set `PACKS_R2_ENDPOINT`, `PACKS_R2_BUCKET`, `PACKS_R2_ACCESS_KEY_ID`, and `PACKS_R2_SECRET_ACCESS_KEY`.
3. Set `PACKS_APP_URL` to the public HTTPS sandbox storefront origin. Set `PACKS_DOWNLOAD_SECRET` to at least 32 bytes of cryptographically random material. Changing it invalidates all previously issued links. Defaults are 30 days and 10 download URL requests per order. Override with `PACKS_DOWNLOAD_DAYS` and `PACKS_DOWNLOAD_LIMIT`.
4. Use a Stripe test secret key in `PACKS_STRIPE_SECRET_KEY` (the existing `STRIPE_SECRET_KEY` is the fallback). Register a separate packs webhook at `https://YOUR-TEST-HOST/api/packs/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, and `charge.dispute.created`. Set its signing secret in `PACKS_STRIPE_WEBHOOK_SECRET`. Apply the additive `forge_packs_stripe_checkout` migration. Never replace the subscription webhook secret. A protected preview needs its authorized automation bypass in the registered webhook URL.

5. Set `PACKS_RESEND_API_KEY` and `PACKS_RECEIPT_FROM`. Use a verified sender and a sandbox buyer email address you can receive mail at.
6. Add an active sandbox test pack and set `PACKS_CHECKOUT_ENABLED=true` in that environment. Deploy the branch to the sandbox origin.

## Add a pack

Add one entry to `apps/web/lib/packs/catalog.ts`. Supply a stable ID, unique URL slug, name, short and long descriptions, approved price in minor currency units, currency, image paths and alt text, file list, size label, approved licence, private object key, and customer-facing archive filename. Use local public paths for preview images, and private bucket keys for the paid archives. Upload the archive to the exact private key before setting `active: true`. Avoid reusing IDs and file keys for replacement products, because purchases retain their original file keys. Reserve `terms`, `privacy`, `refunds`, `download` and `resend` for storefront routes.

## Sandbox acceptance checks

- Open `/packs` from desktop and mobile navigation. Open the active pack as a guest, read its checkout links, and give delivery consent. Continue to Stripe hosted Checkout and use a Stripe test card.
- Verify the confirmation page gives you an order reference and can download the archive. Check the receipt email and use the resend page with the order reference and buyer email.
- Cancel Stripe Checkout and retry. An unpaid session must never unlock a download. The return page checks current payment status server-side and offers **Check payment again** if confirmation fails.
- Replay a signed Stripe completion event. Confirm the expiry is unchanged and the receipt is sent at most once. Refund the test payment and verify the old link cannot request new signed URLs. A URL issued immediately before revocation remains valid for up to 60 seconds.
- Set low sandbox download and expiry limits to test enforcement. Verify an altered token and direct requests for unpaid orders cannot get a download. Check that the optimiser and its subscription checkout still load.

## Prepare for live sales

- Provide pack assets, approved catalogue data, approved Terms, Privacy Policy, Refund Policy and support contact. Replace the legal placeholders and review the immediate-delivery consent and receipt content.
- The optimiser’s existing Stripe Checkout sends configured subscription price IDs and sets no explicit automatic-tax option in application code. Dashboard tax settings were not inspected. Packs charges the configured catalog price and adds no calculated tax. Review UK VAT registration, cross-border digital-services reporting, price display and documentation obligations with the business before launch. Packs uses fixed GBP catalog totals; any approved automatic-tax change must also update payment verification.
- Apply the packs migration to production. Provision scoped private storage and receipt sender details. Use a separate production download secret.
- Use the existing live Stripe account/key, register a separate live packs webhook at `https://www.forgequality.co.uk/api/packs/webhook`, and configure `PACKS_STRIPE_WEBHOOK_SECRET` with that endpoint's signing secret.
- Set `PACKS_APP_URL=https://www.forgequality.co.uk`, complete the checkout review, and enable `PACKS_CHECKOUT_ENABLED` for the production deployment.
- Review retention for pack orders, expired checkout attempts, and delivery data. Periodically clear old `forge_packs.rate_limits` rows, for example those older than a day. Monitor webhook retries and receipt delivery through Stripe and Resend.
