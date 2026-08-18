-- Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health" -
-- echter, beim Live-E2E-Test gefundener Bug: types/audit.types.ts (Backend
-- UND Frontend) wurde bereits um die Kategorie "SLO" erweitert, die
-- DB-CHECK-Constraint audit_log_category_check (Migration von Phase 13)
-- jedoch nicht - jeder recordAuditLog({category: "SLO", ...})-Aufruf schlug
-- dadurch seit Beginn dieser Phase STILL fehl (core/audit-log.ts faengt den
-- Fehler ab und loggt ihn nur, siehe dort), kein einziger SLO_CREATED/
-- SLO_UPDATED/SLO_DELETED/SLO_BREACHED/SLO_RECOVERED-Audit-Eintrag wurde je
-- gespeichert.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT',
    'MAINTENANCE', 'BACKUP', 'USER', 'SYSTEM', 'SLO'
));
