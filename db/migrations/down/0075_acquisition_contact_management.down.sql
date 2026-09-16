DROP TABLE IF EXISTS acquisition_contact_attempts;

ALTER TABLE acquisition_companies
    DROP COLUMN IF EXISTS phone,
    DROP COLUMN IF EXISTS email,
    DROP COLUMN IF EXISTS website_url,
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS address,
    DROP COLUMN IF EXISTS next_contact_at;
