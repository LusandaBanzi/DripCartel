CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_accounts (
 id INTEGER PRIMARY KEY CHECK (id = 1), email VARCHAR(255) UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
 id VARCHAR(80) PRIMARY KEY, name VARCHAR(120) NOT NULL, category VARCHAR(60) NOT NULL,
 price NUMERIC(12,2) NOT NULL CHECK (price >= 0), stock INTEGER NOT NULL CHECK (stock >= 0),
 sizes TEXT[] NOT NULL DEFAULT '{}', colours TEXT[] NOT NULL DEFAULT '{}', description TEXT NOT NULL DEFAULT '',
 image TEXT NOT NULL DEFAULT '', gallery TEXT[] NOT NULL DEFAULT '{}', badge VARCHAR(50) NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);

CREATE TABLE IF NOT EXISTS customer_accounts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), first_name VARCHAR(80) NOT NULL, last_name VARCHAR(80) NOT NULL,
 email VARCHAR(255) NOT NULL UNIQUE, phone VARCHAR(20) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 email_verified BOOLEAN NOT NULL DEFAULT FALSE, email_verified_at TIMESTAMPTZ,
 status VARCHAR(30) NOT NULL DEFAULT 'pending_verification', failed_login_count INTEGER NOT NULL DEFAULT 0,
 locked_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_accounts_email_idx ON customer_accounts(email);
CREATE INDEX IF NOT EXISTS customer_accounts_phone_idx ON customer_accounts(phone);
CREATE INDEX IF NOT EXISTS customer_accounts_status_idx ON customer_accounts(status);

CREATE TABLE IF NOT EXISTS whatsapp_verification_codes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 code_hash CHAR(64) NOT NULL, attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_verification_codes_customer_idx ON whatsapp_verification_codes(customer_id);
CREATE INDEX IF NOT EXISTS whatsapp_verification_codes_expiry_idx ON whatsapp_verification_codes(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 token_hash CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_customer_idx ON password_reset_tokens(customer_id);

CREATE TABLE IF NOT EXISTS customer_sessions (
 id UUID PRIMARY KEY, customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 token_hash CHAR(64) NOT NULL UNIQUE, user_agent TEXT, ip_address INET, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS customer_sessions_customer_idx ON customer_sessions(customer_id);

CREATE TABLE IF NOT EXISTS admin_sessions (
 id UUID PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
 token_hash CHAR(64) NOT NULL UNIQUE, user_agent TEXT, ip_address INET, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS addresses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 label VARCHAR(50) NOT NULL DEFAULT 'Delivery', recipient_name VARCHAR(160) NOT NULL, street TEXT NOT NULL,
 city VARCHAR(100) NOT NULL, province VARCHAR(100) NOT NULL, postal_code VARCHAR(20) NOT NULL, country VARCHAR(10) NOT NULL DEFAULT 'ZA',
 is_default BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS addresses_customer_idx ON addresses(customer_id);

CREATE TABLE IF NOT EXISTS product_variants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id VARCHAR(80) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 sku VARCHAR(100) UNIQUE NOT NULL, size VARCHAR(30) NOT NULL DEFAULT 'One Size', colour VARCHAR(60) NOT NULL DEFAULT 'Default',
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), price NUMERIC(12,2), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(product_id,size,colour)
);
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_idx ON product_variants(sku);

CREATE TABLE IF NOT EXISTS carts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID UNIQUE NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cart_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
 variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT, quantity INTEGER NOT NULL CHECK(quantity > 0),
 UNIQUE(cart_id,variant_id)
);

CREATE TABLE IF NOT EXISTS orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_number VARCHAR(80) UNIQUE NOT NULL,
 idempotency_key VARCHAR(120),
 customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
 status VARCHAR(40) NOT NULL DEFAULT 'pending_payment', subtotal NUMERIC(12,2) NOT NULL CHECK(subtotal >= 0),
 shipping_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(shipping_total >= 0), total NUMERIC(12,2) NOT NULL CHECK(total >= 0),
 currency CHAR(3) NOT NULL DEFAULT 'ZAR', shipping_address JSONB NOT NULL,
 reservation_expires_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE TABLE IF NOT EXISTS order_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id VARCHAR(80) REFERENCES products(id) ON DELETE RESTRICT, variant_id UUID REFERENCES product_variants(id) ON DELETE RESTRICT,
 product_name VARCHAR(120) NOT NULL, size VARCHAR(30) NOT NULL DEFAULT 'One Size', colour VARCHAR(60) NOT NULL DEFAULT 'Default',
 quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price >= 0), line_total NUMERIC(12,2) NOT NULL CHECK(line_total >= 0)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 provider VARCHAR(40) NOT NULL, provider_reference VARCHAR(160) UNIQUE NOT NULL, status VARCHAR(40) NOT NULL DEFAULT 'initiated',
 amount NUMERIC(12,2) NOT NULL CHECK(amount >= 0), currency CHAR(3) NOT NULL DEFAULT 'ZAR', provider_payload JSONB,
 paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id VARCHAR(80) REFERENCES products(id) ON DELETE RESTRICT,
 variant_id UUID REFERENCES product_variants(id) ON DELETE RESTRICT, quantity INTEGER NOT NULL,
 reason VARCHAR(60) NOT NULL, reference_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements(product_id);

CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGSERIAL PRIMARY KEY, actor_type VARCHAR(30) NOT NULL, actor_id VARCHAR(80), action VARCHAR(100) NOT NULL,
 ip_address INET, user_agent TEXT, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);

-- Safe compatibility migrations for an earlier DripCartel database.
ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS colour VARCHAR(60) NOT NULL DEFAULT 'Default';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_idempotency_idx ON orders(customer_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

-- A customer order can have at most one active Paystack payment record. This prevents double initialization.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS authorization_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS access_code TEXT;
-- Reconcile any legacy duplicate payment rows before enforcing one provider payment per order.
WITH duplicates AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id, provider ORDER BY created_at DESC, id DESC) AS rn
  FROM payments
)
DELETE FROM payments p USING duplicates d WHERE p.id=d.id AND d.rn>1;
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_provider_per_order_idx ON payments(order_id, provider);


CREATE TABLE IF NOT EXISTS refunds (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
 order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
 amount NUMERIC(12,2) NOT NULL CHECK(amount > 0),
 status VARCHAR(30) NOT NULL DEFAULT 'requested',
 provider_reference VARCHAR(160),
 provider_payload JSONB,
 reason TEXT NOT NULL DEFAULT '',
 requested_by VARCHAR(30) NOT NULL DEFAULT 'admin',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS refunds_order_idx ON refunds(order_id);

CREATE TABLE IF NOT EXISTS shipments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 carrier VARCHAR(80), tracking_number VARCHAR(160),
 status VARCHAR(40) NOT NULL DEFAULT 'pending',
 shipped_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shipments_tracking_idx ON shipments(tracking_number);

CREATE TABLE IF NOT EXISTS promotion_codes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(40) UNIQUE NOT NULL,
 discount_type VARCHAR(20) NOT NULL CHECK(discount_type IN ('percent','fixed')),
 discount_value NUMERIC(12,2) NOT NULL CHECK(discount_value > 0),
 max_uses INTEGER CHECK(max_uses IS NULL OR max_uses > 0),
 uses_count INTEGER NOT NULL DEFAULT 0 CHECK(uses_count >= 0),
 starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure every existing product has at least one sellable variant. New products should create variants explicitly.
INSERT INTO product_variants(product_id, sku, size, colour, stock, price)
SELECT p.id,
       LEFT('DC-' || REGEXP_REPLACE(p.id, '[^A-Za-z0-9]+', '-', 'g') || '-DEFAULT', 100),
       COALESCE(p.sizes[1], 'One Size'), COALESCE(p.colours[1], 'Default'), p.stock, p.price
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id)
ON CONFLICT DO NOTHING;
UPDATE products p SET stock=(SELECT COALESCE(SUM(v.stock),0) FROM product_variants v WHERE v.product_id=p.id), updated_at=NOW() WHERE EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id);

CREATE TABLE IF NOT EXISTS store_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  standard_shipping NUMERIC(12,2) NOT NULL DEFAULT 60 CHECK (standard_shipping >= 0),
  express_shipping NUMERIC(12,2) NOT NULL DEFAULT 100 CHECK (express_shipping >= 0),
  free_shipping_threshold NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (free_shipping_threshold >= 0),
  country CHAR(2) NOT NULL DEFAULT 'ZA',
  store_name VARCHAR(120) NOT NULL DEFAULT 'DripCartel',
  tagline VARCHAR(255) NOT NULL DEFAULT 'Streetwear with attitude.',
  currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  store_status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (store_status IN ('open','closed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
