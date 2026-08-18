ALTER TABLE api_key_usage DROP COLUMN IF EXISTS response_size_bytes;
ALTER TABLE api_key_usage DROP COLUMN IF EXISTS request_size_bytes;
ALTER TABLE api_key_usage DROP COLUMN IF EXISTS created_by_user_id;
