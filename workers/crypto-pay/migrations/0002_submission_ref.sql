ALTER TABLE crypto_orders ADD COLUMN submission_ref TEXT;
CREATE INDEX IF NOT EXISTS crypto_orders_status ON crypto_orders(status, created_at);
