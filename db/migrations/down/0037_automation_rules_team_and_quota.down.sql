DROP INDEX IF EXISTS idx_automation_rules_team_id;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS team_id;
