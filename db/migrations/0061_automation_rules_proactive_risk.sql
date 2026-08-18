-- Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence" -
-- types/automation.types.ts#AutomationTrigger wurde um
-- PROACTIVE_RISK_DETECTED/PROACTIVE_RISK_CLEARED erweitert (siehe
-- core/proactive-risk-alerting.ts, ausgeloest ueber
-- automation/automation-engine.ts#evaluateAutomationTriggers()). Die
-- DB-CHECK-Constraint auf automation_rules.trigger MUSS in DERSELBEN
-- Migration mitgezogen werden - dieselbe Bugklasse wie 0059.
ALTER TABLE automation_rules DROP CONSTRAINT automation_rules_trigger_check;
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_trigger_check CHECK (trigger IN (
    'INCIDENT_CREATED', 'INCIDENT_RESOLVED', 'ALERT_TRIGGERED', 'ALERT_ESCALATED',
    'PROJECT_CRITICAL', 'PROJECT_WARNING', 'CHECK_FAILED', 'CHECK_RECOVERED',
    'MAINTENANCE_STARTED', 'MAINTENANCE_ENDED', 'ROOT_INCIDENT_CREATED',
    'RESILIENCE_DEGRADED', 'RESILIENCE_RECOVERED',
    'PROACTIVE_RISK_DETECTED', 'PROACTIVE_RISK_CLEARED'
));
