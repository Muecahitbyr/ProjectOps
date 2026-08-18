-- Phase 38 "Enterprise Resilience Alerting & Notification Intelligence" -
-- notification-event.types.ts#NotificationEventType wurde um
-- RESILIENCE_STATUS_DEGRADED/RESILIENCE_STATUS_RECOVERED erweitert (siehe
-- core/resilience-alerting.ts). Die DB-CHECK-Constraint auf
-- notification_events.event_type MUSS in DERSELBEN Migration mitgezogen
-- werden - dieselbe Bugklasse, die bereits einmal real auftrat (siehe
-- 0050_notification_events_incident_escalated.sql, dort dokumentiert als
-- Lehre aus Phase 27, urspruenglich aus Phase 22's AuditCategory-Bug).
-- Keine neue Tabelle: der Statusuebergang selbst wird, wie core/slo-
-- evaluator.ts's lastStatusBySloId vormacht, in-memory erkannt, nicht
-- persistiert - notification_events speichert nur den bereits bestehenden
-- Versand-Datensatz je Kanal, wie fuer jeden anderen NotificationEventType
-- auch.
ALTER TABLE notification_events DROP CONSTRAINT notification_events_event_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_event_type_check CHECK (event_type IN (
    'ALERT_TRIGGERED', 'ALERT_ESCALATED', 'MAINTENANCE_STARTED', 'MAINTENANCE_ENDED',
    'ROOT_INCIDENT_OPENED', 'INCIDENT_ESCALATED', 'RESILIENCE_STATUS_DEGRADED', 'RESILIENCE_STATUS_RECOVERED'
));
