DROP TABLE IF EXISTS auth_sessions;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
