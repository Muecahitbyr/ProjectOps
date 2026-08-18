-- Phase 40 "Enterprise Resilience-Driven Automation" -
-- types/automation.types.ts#AutomationTrigger wurde um
-- RESILIENCE_DEGRADED/RESILIENCE_RECOVERED erweitert (siehe
-- core/resilience-alerting.ts, ausgeloest ueber automation/automation-engine.ts
-- #evaluateAutomationTriggers()). Die DB-CHECK-Constraint auf
-- automation_rules.trigger MUSS in DERSELBEN Migration mitgezogen werden -
-- dieselbe, mehrfach dokumentierte Bugklasse wie bei notification_events
-- (0050/0058) und audit_log.category (0043/0045) - ein vergessener
-- CHECK-Constraint-Sync liesse jeden Versuch, eine Regel mit diesem Trigger
-- anzulegen, an einem rohen 500/23514 statt einer sauberen Validierung
-- scheitern.
ALTER TABLE automation_rules DROP CONSTRAINT automation_rules_trigger_check;
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_trigger_check CHECK (trigger IN (
    'INCIDENT_CREATED', 'INCIDENT_RESOLVED', 'ALERT_TRIGGERED', 'ALERT_ESCALATED',
    'PROJECT_CRITICAL', 'PROJECT_WARNING', 'CHECK_FAILED', 'CHECK_RECOVERED',
    'MAINTENANCE_STARTED', 'MAINTENANCE_ENDED', 'ROOT_INCIDENT_CREATED',
    'RESILIENCE_DEGRADED', 'RESILIENCE_RECOVERED'
));
