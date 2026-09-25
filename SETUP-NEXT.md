# DripCartel production setup

## 1. PostgreSQL
1. Create a PostgreSQL database.
2. Run `database/schema.sql`.
3. Run `database/catalogue.sql` if you want the supplied catalogue.
4. Set `DATABASE_URL` and `DATABASE_SSL` in `.env`.

## 2. WhatsApp verification
Account creation requires a WhatsApp-enabled cellphone number. The server sends the 6-digit OTP through WhatsApp when `WHATSAPP_PROVIDER=meta`.

Configure:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_OTP_TEMPLATE`
- `WHATSAPP_RESET_TEMPLATE`
- `WHATSAPP_TEMPLATE_LANGUAGE`

Create/approve the corresponding WhatsApp Business templates in Meta before production. Local development can use `WHATSAPP_PROVIDER=console`; the OTP will be printed by the server instead of sent.

## 3. Payments
DripCartel now creates orders on the server and initializes Paystack from the backend. Configure `PAYSTACK_SECRET_KEY` and set the Paystack webhook to:

`https://YOUR-DOMAIN/api/payments/paystack/webhook`

The webhook verifies the `x-paystack-signature` HMAC, checks currency and exact amount, then marks the payment/order paid. The browser is never trusted to declare payment successful.

## 4. Admin bootstrap
Set a strong `ADMIN_SETUP_TOKEN`. On the first run, use the admin setup form and enter the token. Once the admin row exists, setup is permanently unavailable.

For a locked-down production deployment, the preferred next hardening step is to remove the setup route after provisioning and provision the admin through an operational CLI/job.

## 5. Run
```powershell
npm install
npm start
```

The site and API are served from the same origin.
