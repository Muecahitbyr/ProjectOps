DROP TABLE IF EXISTS api_key_usage;
DROP INDEX IF EXISTS idx_api_keys_team_id;
ALTER TABLE api_keys DROP COLUMN IF EXISTS team_id;
