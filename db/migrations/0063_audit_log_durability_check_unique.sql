-- Phase 52 "Continuous Operational Assurance" -
-- evaluateAutomationOutcomeDurabilityIfDue() (core/automation-outcome-
-- verification.ts) laeuft als eigener, selbst gedrosselter Sweep im
-- bestehenden Scheduler-Tick (core/monitor.ts). Die Drosselung
-- (lastDriftSweepAt) schuetzt nur INNERHALB eines Prozesses vor
-- Re-Entrancy - zwei unabhaengige Prozesse (z.B. zwei Server-Instanzen),
-- die den Sweep zeitgleich ausfuehren, koennten sonst beide dieselbe
-- "noch nicht geprueft"-Lesung sehen und beide einen Durability-Check-
-- Eintrag fuer dieselbe Execution schreiben (live durch einen echten
-- Zwei-Prozess-Test bestaetigt). Race-Sicherheit ueber einen partiellen
-- UNIQUE INDEX statt Anwendungssperre - derselbe Ansatz wie
-- idx_automation_executions_one_active_per_action (Migration 0053).
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_durability_check_once
    ON audit_log ((metadata->>'executionId'))
    WHERE action = 'AUTOMATION_OUTCOME_VERIFIED' AND metadata->>'phase' = 'DURABILITY_CHECK';
