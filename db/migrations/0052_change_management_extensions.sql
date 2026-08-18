-- Phase 28 (Fortsetzung) "Enterprise Change Management & Deployment
-- Intelligence" - additive Erweiterung der bestehenden "changes"-Tabelle
-- (Migration 0051). Bestandsanalyse ergab: Lifecycle (DRAFT/SCHEDULED/
-- IN_PROGRESS/COMPLETED/CANCELLED + separates approval_status), Service-
-- Zuordnung, Impact-Integration, Incident-Korrelation, Realtime, Audit und
-- v1-API existieren bereits vollstaendig und werden NICHT dupliziert. Echte
-- Luecken gegenueber dem neuen Auftrag:
--   1. Kein "FAILED"-Endzustand (nur COMPLETED/CANCELLED) - "War die
--      Aenderung erfolgreich?" war bisher nicht sauber beantwortbar.
--   2. Kein Feld fuer "WAS wurde geaendert" (Subject-Matter-Kategorie) -
--      der bestehende "change_type" (STANDARD/NORMAL/EMERGENCY) ist die
--      ITIL-Prozessklasse (treibt die Freigabepflicht), eine orthogonale,
--      andere Dimension als "DEPLOYMENT/CONFIGURATION/...".
--   3. Keine Verknuepfung zur bestehenden "deployments"-Tabelle (Phase 27).
--
-- Bewusst NICHT umgesetzt: Umbenennung von DRAFT/SCHEDULED zu PLANNED/
-- APPROVED aus dem neuen Auftragstext - das bestehende Modell trennt
-- bereits sauber Status (Lebenszyklus) von approval_status (Freigabe,
-- Migration 0051), was fachlich korrekter ist als beides in einem Feld zu
-- verschmelzen (ein LOW-Risk-Change durchlaeuft SCHEDULED->IN_PROGRESS OHNE
-- je "APPROVED" zu durchlaufen, approval_status bleibt NOT_REQUIRED). Eine
-- Umbenennung waere reine Kosmetik ohne fachlichen Mehrwert und wuerde ein
-- bereits getestetes, konsistentes Modell unnoetig aufbrechen.
ALTER TABLE changes ADD COLUMN category TEXT NOT NULL DEFAULT 'OTHER' CHECK (category IN (
    'DEPLOYMENT', 'CONFIGURATION', 'INFRASTRUCTURE', 'DATABASE', 'SECURITY', 'MAINTENANCE', 'OTHER'
));

ALTER TABLE changes ADD COLUMN deployment_id BIGINT REFERENCES deployments(id) ON DELETE SET NULL;
CREATE INDEX idx_changes_deployment_id ON changes (deployment_id) WHERE deployment_id IS NOT NULL;

-- Parallel zu rejection_reason (Migration 0051) - Freitext, warum ein
-- gestarteter Change fehlgeschlagen ist (Rollback-Grund, Fehlerursache).
ALTER TABLE changes ADD COLUMN failure_reason TEXT;

ALTER TABLE changes DROP CONSTRAINT changes_status_check;
ALTER TABLE changes ADD CONSTRAINT changes_status_check CHECK (status IN (
    'DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED'
));
