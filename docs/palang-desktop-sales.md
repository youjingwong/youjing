# Palang IC Desktop sales setup

The website sells one Palang IC Desktop purchase for **RM29.90 MYR**. A purchase includes the Apple Silicon Mac, Intel Mac, and Windows x64 installers. The browser editor remains free and continues to process identity images locally without uploading them.

The payment and fulfillment flow is deliberately split from the editor:

1. `/palang-ic/desktop` creates a server-controlled order and PaymentIntent.
2. Airwallex hosts the payment form, so this site never handles card details.
3. Airwallex sends `payment_intent.succeeded` to the webhook.
4. The verified webhook durably hands a minimized payment event to Upstash QStash, then acknowledges Airwallex without waiting for email delivery.
5. A QStash-signed worker validates the PaymentIntent against the stored order, marks it paid, and sends the delivery email. QStash retries transient failures.
6. The success page reads that durable state and offers the three installers.
7. Resend emails the same secure portal link. Installers are links, never email attachments.
8. Each download request rechecks the paid order and redirects to a five-minute S3-compatible signed URL.

The browser keeps a signed order-access token in same-tab session storage before leaving for Airwallex. The Airwallex return URL is clean, and the emailed portal token is placed in the URL fragment so it is not sent in HTTP requests. The success redirect is navigation, not proof of payment.

Status polling backs off and stops after five minutes. Server-side budgets limit status checks to 60 per minute per purchase and signed-download creation to 12 per hour per purchase.

## 1. Release signing gate

Do not upload or sell the current local artifacts. They are unsigned development builds.
`PALANG_DESKTOP_SALES_ENABLED` defaults to `false`, so the checkout API cannot create a charge until the release gate is deliberately opened.
The product page also reads this flag during the Next.js build; redeploy after changing it so the public checkout state and server gate agree.

Before enabling production checkout:

- Sign both macOS applications with a Developer ID Application certificate.
- Notarize and staple both macOS DMGs.
- Authenticode-sign the Windows application and NSIS installer.
- Test installation, HEIC handling, exports, Keychain/DPAPI access, backup/restore, update/reinstall retention, and uninstall behavior on Apple Silicon macOS, Intel macOS, Windows 10 x64, and Windows 11 x64.
- Finalize the customer licence, refund/support policy, and support response expectations.

See `desktop/README.md` and `desktop/V1_STATUS.md` for the existing release checklist.

## 2. Configure private artifact storage

Create a private AWS S3 or Cloudflare R2 bucket. Create a narrowly scoped credential that can only read and inspect the three release objects. Keep object keys immutable and versioned.

Set the `PALANG_DESKTOP_STORAGE_*` variables from `.env.example`, then upload the signed files to the three configured object keys. Record each exact byte size and SHA-256 digest in the matching environment variables, and store that lowercase hex digest as the object's `sha256` custom metadata. Do not put installers in `public/`, a public GitHub release, or a serverless function response.

Checkout performs a cached HEAD check against all three immutable objects and refuses to accept payment unless each object exists and its size and `sha256` metadata match the release gate. Compute hashes only after code signing, notarization, stapling, and final platform QA.

When using AWS S3, `PALANG_DESKTOP_STORAGE_ENDPOINT` can be left empty and the region should be the bucket's AWS region. For R2, use the account's S3 endpoint, region `auto`, and the R2 access key pair.

## 3. Create durable order storage

Create an Upstash Redis database and copy its REST URL and standard REST token into:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

The standard token is server-only. Never expose it through a `NEXT_PUBLIC_*` variable. Order records contain the buyer email, Airwallex PaymentIntent ID, payment state, and fulfillment timestamps; identity images are never stored in this database. Pending or failed records expire after 30 days. A verified paid record is retained for 400 days for purchase support and then expires; Redis updates preserve that TTL. Accounting records that must be kept longer belong in the accounting/payment system, not this download database.

## 4. Configure the fulfillment queue

Create an Upstash QStash account and copy its publisher token plus both receiver signing keys into:

```text
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY
```

The Airwallex webhook publishes only the fields needed to match a payment: event ID, PaymentIntent ID, merchant order ID, product/order metadata, amount, currency, and status. It does not enqueue the buyer email, card data, or the rest of the Airwallex object. QStash logs redact the message body.

QStash delivers to `/api/palang-desktop/fulfill`. The worker verifies the `Upstash-Signature` against both rotation keys and the exact configured destination URL before reading the message. QStash deduplicates immediate Airwallex retries by a SHA-256 hash of the event ID, while the paid-order update and Resend idempotency key remain safe if a message is delivered again later.

The primary message gets three automatic retries. If those are exhausted, QStash calls the separately signed `/api/palang-desktop/fulfillment-failed` recovery endpoint, which decodes the original minimized message and runs fulfillment through another retry cycle. This keeps all automatic retries inside Resend's 24-hour idempotency window. Monitor both QStash logs and the DLQ: no finite queue can recover automatically from an outage that outlasts every retry. Before manually replaying an old DLQ item, check the order's `emailSentAt` state and the Resend email log to avoid sending an unnecessary duplicate.

Do not accept a live payment until a preview webhook test proves that Airwallex receives a prompt 200 after QStash accepts the event, the QStash worker retries a forced transient failure, the failure callback recovers an exhausted test message, and a successful retry sends exactly one email.

## 5. Configure Airwallex sandbox

Confirm that the intended provider is **Airwallex** (the request originally called it “AirWallets”). In the Airwallex demo account:

1. Enable Payments and at least one MYR-compatible payment method.
2. Create a Client ID and API key under Developer settings.
3. Set `AIRWALLEX_ENV=demo`, `AIRWALLEX_CLIENT_ID`, and `AIRWALLEX_API_KEY`. Set `PALANG_DESKTOP_SALES_ENABLED=true` only in the controlled sandbox or preview where you are actively testing.
4. Set `PALANG_SITE_URL` to the deployed HTTPS origin.
5. Register this webhook URL:

   ```text
   https://www.youjing.dev/api/palang-desktop/webhook
   ```

6. Subscribe to `payment_intent.succeeded` and copy that webhook URL's secret into `AIRWALLEX_WEBHOOK_SECRET`.

The checkout API fixes the price and currency at RM29.90/MYR. It never accepts them from the browser. Airwallex Client ID, API key, webhook secret, and access tokens remain server-side.

Run Airwallex's required sandbox cases before production: successful payment, failed payment, and 3-D Secure authentication. Confirm that duplicate webhook deliveries do not duplicate the email and that an unpaid success-page visit never exposes downloads.

## 6. Configure email delivery

Verify a dedicated sending subdomain with Resend, create a sending-only API key, and set:

```text
RESEND_API_KEY
PALANG_DESKTOP_FROM_EMAIL=Palang IC <downloads@updates.youjing.dev>
```

The worker uses `purchase/<order-id>` as Resend's idempotency key. Email contains a secure portal link rather than the 100+ MB installers.
If email delivery is unavailable, the verified paid state remains durable, the same-tab portal can still unlock, and QStash retries the worker without holding Airwallex's webhook open.

## 7. Generate the portal signing secret

Generate a high-entropy secret and store it only in the deployment environment:

```bash
openssl rand -base64 48
```

Set the result as `PALANG_DESKTOP_TOKEN_SECRET`. Rotating it invalidates previously issued portal links.

## 8. Deploy and test

The host must support Next.js Pages Router API functions; a static export is not sufficient. Copy `.env.example` to `.env.local` for local sandbox work and set the same secrets in the production hosting dashboard.

Deploy behind a trusted reverse proxy that overwrites `X-Forwarded-For`/`X-Real-IP`; the checkout limiter uses the first validated client address and fails closed if no address is available. Do not expose the function origin directly with user-controlled forwarding headers.

Run:

```bash
yarn lint
yarn typecheck
yarn test
yarn build
```

For a full sandbox checkout, use a public HTTPS preview deployment so Airwallex can redirect to the success page and reach the webhook. Never use production credentials in a preview owned by someone else.

## 9. Go live

After signed-artifact and sandbox sign-off:

1. Create separate production Airwallex credentials and webhook subscription.
2. Change `AIRWALLEX_ENV` to `prod`.
3. Upload the signed production artifacts under new versioned keys and update the three artifact-key variables.
4. Confirm the sender domain, private bucket policy, Redis retention, QStash delivery logs/DLQ, support inbox, refund policy, and accounting/tax treatment.
5. Set `PALANG_DESKTOP_SALES_ENABLED=true` only after all previous checks pass.
6. Make one real low-value purchase, verify the Airwallex event, email, success portal, all three downloads, hashes, and installer signatures, then refund that test purchase from the normal operations flow.

Airwallex Payments processes the payment but is not automatically the merchant of record. Confirm the business's tax, receipt, consumer-law, and refund obligations before launch.

The checkout also rejects `AIRWALLEX_ENV=demo` on `youjing.dev` and rejects production credentials on preview or localhost origins. Keep demo and production webhook secrets, Redis databases, and artifact buckets separate.

The initial entitlement policy is deliberately simple: a refund or dispute does not pretend to revoke an installer that may already have been downloaded, and an existing portal link expires naturally after 30 days. Handle refunds and disputes in Airwallex and the support workflow. Add a licence/activation system and revocable entitlement state only if the product policy later requires remote revocation.
