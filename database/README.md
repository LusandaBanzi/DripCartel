# DripCartel PostgreSQL database

This directory contains the **real production database structure** for DripCartel. It does not contain demo customers, demo orders, demo payments, or fake sales data.

## 1. Create the database

Create an empty PostgreSQL database named `dripcartel` (or another name you choose). Keep the database credentials outside GitHub.

## 2. Apply the schema

Run `schema.sql` against the empty database. It creates the application tables, indexes, constraints, inventory structures, order/payment structures, security/audit tables, and store settings.

Example with `psql`:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

## 3. Load the real DripCartel catalogue

Run `catalogue.sql` after the schema. This file contains the supplied DripCartel product catalogue, prices, sizes, image paths, and SKU variants. It does **not** create customers, orders, payments, or revenue history.

```bash
psql "$DATABASE_URL" -f database/catalogue.sql
```

If your actual physical stock counts differ from the current catalogue quantities, update those quantities through the admin inventory tools before opening sales. Do not invent customer/order data just to populate the dashboard.

## 4. Verify the connection

Start the API with the real `DATABASE_URL` in the environment and check:

```text
GET /api/health
```

A healthy database connection returns `{"ok":true,"service":"dripcartel-api"}`.

## Production data rules

- Customer records are created only through real registration.
- Orders are created only through real checkout.
- Payments are created only by the payment flow/webhook.
- Inventory changes are recorded by real stock/order operations.
- Admin dashboard figures are calculated from real database records.
- Never commit `.env`, database passwords, database dumps, or production customer data to GitHub.
