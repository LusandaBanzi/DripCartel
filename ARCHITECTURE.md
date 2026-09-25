# DripCartel deployment architecture

```text
GitHub repository
├── frontend/  ──> GitHub Pages
├── backend/   ──> Node/Express API host
└── database/  ──> managed PostgreSQL

GitHub Pages frontend
        │ HTTPS + HttpOnly cookie
        ▼
DripCartel API
   ├── PostgreSQL
   ├── Meta WhatsApp Cloud API
   └── Paystack
```

The frontend is static and contains no database credentials, JWT secrets, WhatsApp tokens or Paystack secret keys.

The backend owns authentication, customer sessions, orders, inventory, payment initialization and webhook verification.
