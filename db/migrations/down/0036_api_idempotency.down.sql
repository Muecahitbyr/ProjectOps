ALTER TABLE api_key_usage DROP COLUMN IF EXISTS idempotency_replay;
ALTER TABLE api_key_usage DROP COLUMN IF EXISTS mutation;
DROP TABLE IF EXISTS api_idempotency_keys;
