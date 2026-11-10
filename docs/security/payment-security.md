# Payment and e-commerce security

Payments run in **test mode only** until the owner approves live payments. Providers: the mock adapter (local and CI) and the Stripe adapter in test mode. `PAYMENTS_LIVE_APPROVED` is never set in this repository; the Stripe adapter refuses `sk_live_`/`rk_live_` keys without it (unit-tested).

| Concern | Control | Where | Test |
|---|---|---|---|
| Client-supplied prices or totals | The client sends variant ids and quantities only. Unit prices, delivery fee (per municipality, from Postgres) and totals are computed inside the order transaction and snapshotted on `OrderItem` | `shop/orders.ts` | `shop.test.ts`: a `price` in the request is ignored |
| Product id tampering | Variant must exist, be active, and belong to an ACTIVE product; unknown → 404/409 | `shop/routes.ts`, `orders.ts` | `shop.test.ts` |
| Order ownership | Bound to the signed-in user or the guest's email; read by owner or by the hashed link key; a wrong key looks like no order (404) | `shop/routes.ts` | `shop.test.ts` |
| Payment status | Changed **only** by a provider event with a valid signature, processed under `SELECT … FOR UPDATE`. The success page only reads status; it never marks anything paid | `payments.ts`, `orders.ts` | `shop.test.ts`: paid only after a signed webhook, replay applied once, failed payment releases stock; e2e checkout → test payment → confirmation |
| Webhook signatures | Raw body (mounted before the JSON parser); Stripe `Stripe-Signature` with tolerance; mock HMAC; failures logged as `security.webhook_bad_signature` | `shop/routes.ts` webhook | `payments.test.ts`, `shop.test.ts` (bad signature 400) |
| Duplicate deliveries | `WebhookEvent` insert first (unique event id); a replay is a no-op | `orders.ts` | `shop.test.ts`: replay is a no-op |
| Double submits | `idempotencyKey` (UUID) unique on `Order`; a concurrent repeat returns the same order | `orders.ts` | `shop.test.ts`; load test: double-clicks merged |
| Overselling | Per line, a conditional `UPDATE … WHERE onHand - reserved >= qty` (sorted to avoid deadlocks) plus a `reserved <= onHand` CHECK; holds expire after `RESERVATION_MINUTES`, and the expiry job asks the provider first | `orders.ts` | `shop.test.ts` (8 parallel checkouts → 1 order); `pnpm load:test` (300 shoppers / 40 units → 40 orders, no oversell) |
| Late payment after expiry | Re-takes stock if available, otherwise refunds automatically | `orders.ts` | `shop.test.ts` |
| Refunds | `payments.refund` only; partial or full; restock only with a full refund; audited | `shop/admin-routes.ts` | `shop.test.ts`; customers get 403 |
| Price and stock changes | `products.write` / `inventory.adjust`; audited with before and after | `shop/admin-routes.ts` | `shop.test.ts` |
| Reconciliation | The expiry job queries the provider before cancelling a hold; the admin order view shows provider status. A scheduled full reconciliation is a pre-launch item (checklist) | `orders.ts` | — |
| Secrets | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` live in the API environment only; the mock secret is required in mock mode | `config/env.ts` | env validation |
| Test isolation | `Payment.isTest`; test-mode banners on checkout and order pages; the mock endpoints exist only when `PAYMENT_PROVIDER=mock` | `payments.ts`, web | e2e |
| Checkout abuse | Per-visitor checkout limit (H-1), fails closed when Redis is down (M-2); honeypot field | `shop/routes.ts` | `rate-limit.test.ts` |

## Before going live (needs owner approval)
Switch the provider to live keys from the platform's secret store; set `PAYMENTS_LIVE_APPROVED=true` only in production; register the production webhook endpoint and secret; run one real low-value payment and refund; enable a daily reconciliation report.
