-- Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence" -
-- notification-event.types.ts#NotificationEventType wurde um
-- PROACTIVE_RISK_DETECTED/PROACTIVE_RISK_CLEARED erweitert (siehe
-- core/proactive-risk-alerting.ts). Die DB-CHECK-Constraint auf
-- notification_events.event_type MUSS in DERSELBEN Migration mitgezogen
-- werden - dieselbe, mehrfach dokumentierte Bugklasse wie
-- 0050_notification_events_incident_escalated.sql /
-- 0058_notification_events_resilience_status.sql.
ALTER TABLE notification_events DROP CONSTRAINT notification_events_event_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_event_type_check CHECK (event_type IN (
    'ALERT_TRIGGERED', 'ALERT_ESCALATED', 'MAINTENANCE_STARTED', 'MAINTENANCE_ENDED',
    'ROOT_INCIDENT_OPENED', 'INCIDENT_ESCALATED', 'RESILIENCE_STATUS_DEGRADED', 'RESILIENCE_STATUS_RECOVERED',
    'PROACTIVE_RISK_DETECTED', 'PROACTIVE_RISK_CLEARED'
));
