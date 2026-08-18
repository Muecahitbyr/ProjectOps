ALTER TABLE projects ALTER COLUMN organization_id DROP NOT NULL;
DROP INDEX IF EXISTS idx_projects_organization_id;
ALTER TABLE projects DROP COLUMN IF EXISTS organization_id;

DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS service_accounts;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS team_notification_settings;

ALTER TABLE alert_rules DROP COLUMN IF EXISTS team_id;

DROP TABLE IF EXISTS project_teams;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;
