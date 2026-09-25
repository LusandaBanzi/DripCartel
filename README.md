# DripCartel

Production-oriented DripCartel storefront foundation: secure customer authentication, WhatsApp verification, server-owned checkout, transactional inventory, Paystack payment initialization/webhooks, PostgreSQL persistence, protected admin APIs, audit logging and a responsive storefront.

## What changed

- Customer signup now explicitly requires a **WhatsApp-enabled cellphone number**.
- Account verification is **WhatsApp OTP**, not email OTP.
- Password recovery is WhatsApp-first.
- Password-reset links are single-use, expire after 30 minutes, and active customer sessions are revoked after reset.
- Login errors are generic and failed attempts are throttled/account-locked.
- Customer and admin sessions are server-revocable and stored in PostgreSQL.
- Admin bootstrap can be protected with `ADMIN_SETUP_TOKEN`.
- Product writes require an admin session.
- Checkout is server-side: the server validates products, prices, stock, address and quantities.
- Inventory reservation is transactional and expires after 30 minutes if unpaid.
- Orders have idempotency keys to prevent duplicate checkout submissions.
- Paystack is initialized from the backend; the browser never holds the secret key.
- Paystack webhooks are HMAC-verified and amount/currency checked before an order is marked paid.
- Security/audit events are stored server-side.
- CSP, security headers, origin checks and rate limiting are enabled.
- The admin dashboard contains no demo customers, demo orders, demo payments or demo revenue figures; dashboard data comes from PostgreSQL records created by real store activity.

## Important production configuration

WhatsApp Cloud API and Paystack require merchant/provider credentials and approved templates. The project cannot send real WhatsApp messages or accept real payments until those provider accounts are configured.

See `SETUP-NEXT.md` and `.env.example`.

## Deployment architecture

The repository is split for production hosting: `frontend/` is deployed to GitHub Pages, while `backend/` runs as a separate Node/Express API and `database/` is applied to managed PostgreSQL. The frontend talks to the API through the public `DRIP_API_BASE_URL` configuration. See `DEPLOYMENT-GITHUB.md` and `ARCHITECTURE.md`.


## Production commerce status

The current build includes:
- authenticated checkout enforced by the API
- server-side price and stock validation
- product variants with SKU/size/colour/stock
- transactional inventory reservations with expiry
- idempotent order creation and one Paystack payment record per order
- signed Paystack webhook processing with amount/currency verification
- customer addresses and shipment tracking records
- admin inventory adjustments, order workflow and provider-backed refunds
- WhatsApp-first account verification/password recovery
- server-side sessions, rate limits, audit logging and secure cookies
- GitHub Pages frontend deployment workflow
- smoke tests for the production foundation

Real provider credentials, PostgreSQL, backend hosting, domain/HTTPS and webhook configuration are still required before live sales.
