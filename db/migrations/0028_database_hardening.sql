-- Phase 10 "Database Hardening" (Auftragspunkt 10) - Ergebnis einer
-- Ueberpruefung aller Tabellen auf fehlende Indizes/Fremdschluessel:
--
-- 1) notifications.check_id verwies bisher auf keinen Fremdschluessel
--    (im Unterschied zu check_results/incidents, die beide dieselbe Spalte
--    korrekt gegen checks(id) absichern) - ein geloeschter/umbenannter Check
--    (siehe Migration 0006, dasselbe Muster) hat dadurch bereits einige
--    verwaiste notifications-Zeilen hinterlassen, die vor Hinzufuegen des
--    Constraints entfernt werden muessen (reine Log-/Audit-Daten ohne
--    gueltigen Bezug mehr, kein Verlust fachlicher Daten).
DELETE FROM notifications n
    WHERE NOT EXISTS (SELECT 1 FROM checks c WHERE c.id = n.check_id);

ALTER TABLE notifications
    ADD CONSTRAINT notifications_check_id_fkey FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE;

-- 2) getOpenRootIncidentForCheckType() (db/root-incidents.repository.ts,
--    Phase 9) filtert bei jedem Scheduler-Tick nach
--    "cause_check_type = $1 AND resolved_at IS NULL" - bisher ohne
--    passenden Index (Full-Table-Scan bei wachsender Tabelle).
CREATE INDEX IF NOT EXISTS idx_root_incidents_open_by_cause
    ON root_incidents (cause_check_type) WHERE resolved_at IS NULL;
