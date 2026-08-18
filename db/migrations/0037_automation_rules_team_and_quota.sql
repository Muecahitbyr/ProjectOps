-- Phase 18 "Secure Automation Rule API, Developer Experience & Production
-- Hardening" Auftragspunkt 3/4 - team_id auf automation_rules, additiv und
-- nullable (bestehende Regeln bleiben unveraendert gueltig, team_id = NULL).
-- Mirrort exakt das Muster von alert_rules.team_id (Migration 0033,
-- "Team-spezifische Alerts") fuer dieselbe Bedeutung bei Automation-Regeln
-- (team-spezifische Automation): eine Regel kann optional einem Team
-- zugeordnet sein, bleibt aber weiterhin ueber project_id eindeutig einer
-- Organisation zugeordnet (transitiv ueber projects.organization_id, siehe
-- routes/v1/automation-rules.routes.ts) - team_id engt nur zusaetzlich
-- INNERHALB der Organisation ein, ist keine zweite Tenant-Grenze.
ALTER TABLE automation_rules ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX idx_automation_rules_team_id ON automation_rules (team_id) WHERE team_id IS NOT NULL;
