-- Eskalationsstufen (Auftragspunkt 6): pro Alert-Regel eine geordnete Liste
-- von Stufen "nach X Minuten anhaltendem Alert -> ueber Kanal Y benachrichtigen".
-- additional_project_role erweitert bei Bedarf den Empfaengerkreis auf eine
-- ganze Rolle (Beispiel "nach 30 Minuten -> weitere Nutzer") statt nur den
-- urspruenglichen Empfaengerkreis erneut zu benachrichtigen. Der Scheduler
-- (alerts/alert-evaluator.ts) prueft bei jedem Tick, welche Stufen faellig
-- sind (alert_events.last_escalated_step), und feuert sie genau einmal.
CREATE TABLE IF NOT EXISTS alert_escalation_steps (
    id BIGSERIAL PRIMARY KEY,
    alert_rule_id BIGINT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    after_minutes INTEGER NOT NULL CHECK (after_minutes >= 0),
    channel_id TEXT NOT NULL REFERENCES notification_channels(id),
    additional_project_role TEXT CHECK (additional_project_role IN ('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (alert_rule_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_alert_escalation_steps_rule_id
    ON alert_escalation_steps (alert_rule_id, step_order);
