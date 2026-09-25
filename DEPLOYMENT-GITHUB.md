# DripCartel GitHub + API deployment

DripCartel is intentionally split into two deployable parts:

- `frontend/` — static storefront, deployed to GitHub Pages.
- `backend/` + `database/` — Node/Express API and PostgreSQL schema, deployed to a server/container platform and managed database.

## 1. GitHub repository

Push the whole repository. Do **not** put real secrets in GitHub files.

The GitHub Pages workflow publishes only `frontend/`.

## 2. GitHub Pages

Enable GitHub Pages using **GitHub Actions** as the source.

Create this repository variable:

`Settings → Secrets and variables → Actions → Variables → New repository variable`

Name:

`DRIP_API_BASE_URL`

Value:

`https://api.yourdomain.com`

This is a public URL, so it is a repository **variable**, not a secret.

The workflow refuses to deploy if this value is missing.

## 3. Backend

Deploy the repository's Node API using:

`npm install`

then:

`npm start`

Set these backend environment variables on the hosting provider:

- `NODE_ENV=production`
- `PORT` (provided by the host)
- `FRONTEND_ORIGIN=https://your-pages-domain.example`
- `COOKIE_SAMESITE=none` when using the default `*.github.io` frontend with a separately hosted API.
- `DATABASE_URL=...`
- `DATABASE_SSL=true`
- `JWT_SECRET=...`
- `AUTH_PEPPER=...`
- `WHATSAPP_PROVIDER=meta`
- `WHATSAPP_ACCESS_TOKEN=...`
- `WHATSAPP_PHONE_NUMBER_ID=...`
- `WHATSAPP_GRAPH_VERSION=...`
- `WHATSAPP_OTP_TEMPLATE=...`
- `WHATSAPP_RESET_TEMPLATE=...`
- `WHATSAPP_TEMPLATE_LANGUAGE=en_US`
- `DEFAULT_COUNTRY_CODE=27`
- `PAYSTACK_SECRET_KEY=...`
- `ADMIN_SETUP_TOKEN=...`

## 4. Database

Create PostgreSQL on a managed database provider and run:

`database/schema.sql`

Then load the real DripCartel catalogue using:

`database/catalogue.sql`

Never put the database password in the repository.

## 5. Paystack

Configure the Paystack webhook to point to:

`https://api.yourdomain.com/api/payments/paystack/webhook`

The secret key remains on the backend.

## 6. WhatsApp

Configure Meta WhatsApp Cloud API and approved message templates for:

- account verification OTP
- password reset

The frontend never receives the WhatsApp access token.

## 7. CORS

`FRONTEND_ORIGIN` must exactly match the browser origin, including `https://` and excluding a trailing slash.

Example:

`FRONTEND_ORIGIN=https://username.github.io`

or, preferably when a custom domain is configured:

`FRONTEND_ORIGIN=https://dripcartel.co.za`

## 8. Local development

From the repository root:

`npm install`

`npm start`

The backend serves `frontend/` locally at `http://localhost:3000`.

The local frontend configuration automatically uses `http://localhost:3000` until the GitHub Pages workflow replaces it with `DRIP_API_BASE_URL`.
