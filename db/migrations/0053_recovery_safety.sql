-- Phase 30 "Enterprise Reliability, Automated Recovery & Operational
-- Resilience" - Bestandsanalyse ergab: die Automation-Engine (Phase 9-18,
-- Migrationen 0022/0026/0030/0037) ist bereits ein vollstaendiger Rule ->
-- Action -> Execution-Lebenszyklus mit Cooldown, stuendlichem Rate-Limit,
-- Freigabe-Workflow, echten (nicht vorgetaeuschten) Ausfuehrungspfaden
-- (safe-action-runner.ts) und Realtime/Timeline-Integration. Das IST der
-- "Recovery Action"-Mechanismus, den der neue Auftrag beschreibt - eine
-- zweite, parallele recovery_actions-Tabelle waere exakt die verbotene
-- "zweite Automation-Engine". Echte Luecken gegenueber dem neuen Auftrag:
--   1. Keine Risiko-/Timeout-/Wiederholungsgrenze PRO REGEL (nur globales
--      stuendliches Rate-Limit, kein Timeout, keine Pro-Incident-Obergrenze).
--   2. Der manuelle Ausfuehrungspfad (POST /automation-actions/:id/execute)
--      und der automatische Regel-Pfad (automation-engine.ts) pruefen vor
--      dem Start NICHT: laeuft bereits ein Change fuer den betroffenen
--      Service, ist ein Wartungsfenster aktiv, ist der Incident bereits
--      geloest. Ein Safety-Gate fehlt vollstaendig.
--   3. Zwei parallele Ausfuehrungsversuche derselben Aktion sind nicht
--      race-safe - automation_executions kennt keine Beschraenkung "hoechstens
--      eine nicht-abgeschlossene Ausfuehrung je Aktion".
--   4. Fuer den neuen Incident->Recovery-Fluss (siehe core/recovery-safety.ts)
--      muss GENAU EINE automation_actions-Zeile je (Regel, Incident)
--      existieren, sonst waere "COMPLETED/FAILED/Wiederholungszaehler pro
--      Incident" nicht sauber auswertbar.
-- Alles additiv mit Defaults - bestehende Regeln/Aktionen bleiben gueltig.

ALTER TABLE automation_rules ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

-- Ein CRITICAL-Risiko darf strukturell NIE approval_required=false sein -
-- dieselbe DB-erzwungene Sicherheitsentscheidung wie schon
-- automation_rules_auto_execute_safe_only (Migration 0030), nur fuer die
-- neue Risikostufe statt den Aktionstyp.
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_critical_requires_approval CHECK (
    risk_level <> 'CRITICAL' OR approval_required = true
);

ALTER TABLE automation_rules ADD COLUMN timeout_seconds INTEGER NOT NULL DEFAULT 60
    CHECK (timeout_seconds > 0 AND timeout_seconds <= 3600);

-- Unterscheidet sich bewusst vom bestehenden max_executions_per_hour
-- (globales, zeitfensterbasiertes Rate-Limit ueber ALLE Incidents hinweg):
-- max_attempts_per_incident begrenzt, wie oft dieselbe Regel fuer DENSELBEN
-- Incident wiederholt werden darf (Auftragspunkt 2 "maximale Wiederholungen").
ALTER TABLE automation_rules ADD COLUMN max_attempts_per_incident INTEGER NOT NULL DEFAULT 3
    CHECK (max_attempts_per_incident > 0 AND max_attempts_per_incident <= 20);

-- Race-Safety Teil 1 (Auftragspunkt 5): hoechstens EINE nicht-abgeschlossene
-- Ausfuehrung je Aktion gleichzeitig. Ein zweiter INSERT-Versuch waehrend
-- CREATED/RUNNING verletzt diesen Index (Fehlercode 23505), der Aufrufer
-- (core/recovery-safety.ts) faengt das exakt wie schon
-- service-dependencies.repository.ts#createDependencyIfUnderQuota ab und
-- meldet ALREADY_RUNNING statt eines rohen 500.
CREATE UNIQUE INDEX idx_automation_executions_one_active_per_action
    ON automation_executions (automation_action_id)
    WHERE status IN ('CREATED', 'RUNNING');

-- Race-Safety Teil 2: hoechstens EINE nicht-abgelehnte Recovery-Aktion je
-- (Regel, Incident)-Paar - das "Finde-oder-Erzeuge"-Muster in
-- core/recovery-safety.ts verlaesst sich darauf (INSERT ... ON CONFLICT DO
-- NOTHING + anschliessendes SELECT), damit alle parallelen Ausfuehrungs-
-- Anfragen fuer denselben Incident garantiert auf DIESELBE Aktionszeile (und
-- damit auf denselben Execution-Lock aus Teil 1) treffen.
CREATE UNIQUE INDEX idx_automation_actions_rule_incident_active
    ON automation_actions (rule_id, incident_id)
    WHERE status <> 'REJECTED' AND rule_id IS NOT NULL AND incident_id IS NOT NULL;
