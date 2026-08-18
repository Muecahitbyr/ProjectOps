-- Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
-- Intelligence" - erweitert audit_log_category_check um "SERVICE" IN
-- DERSELBEN Phase, in der die Kategorie eingefuehrt wird (Lehre aus dem in
-- Phase 22 gefundenen Bug: dort wurde "SLO" im TS-Typ ergaenzt, aber die
-- DB-CHECK-Constraint zunaechst vergessen - jeder recordAuditLog({category:
-- "SLO"})-Aufruf schlug dadurch bis zur Nachbesserung still fehl).
ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT',
    'MAINTENANCE', 'BACKUP', 'USER', 'SYSTEM', 'SLO', 'SERVICE'
));
