ALTER TABLE incidents DROP COLUMN IF EXISTS last_escalated_step;
ALTER TABLE incidents DROP COLUMN IF EXISTS escalation_policy_id;
ALTER TABLE services DROP COLUMN IF EXISTS escalation_policy_id;
DROP TABLE IF EXISTS escalation_policy_steps;
DROP TABLE IF EXISTS escalation_policies;
