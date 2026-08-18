-- Phase 27 "Enterprise On-Call & Escalation Management".
--
-- Bestandsanalyse (siehe Abschlussbericht "Architekturentscheidungen"):
-- Alert-Eskalation existiert bereits vollstaendig und produktiv seit Phase
-- 20/24 (alert_escalation_steps, alerts/alert-evaluator.ts) - eine Stufe
-- benachrichtigt einen notification_channel, optional aufgeloest ueber ein
-- on_call_schedule. Dieses System wird hier NICHT angefasst/dupliziert.
--
-- Die echte Luecke: INCIDENTS (aus core/monitor.ts, check-basiert - ein
-- komplett anderer, bereits bewusst getrennter Vorfalls-Strom als
-- alert_events, siehe Phase 21) haben bislang KEINE Eskalation. Diese
-- Migration schliesst genau diese Luecke mit einer eigenstaendigen,
-- wiederverwendbaren "Escalation Policy" (mehrstufig, Ziel User ODER
-- On-Call-Schedule/"Team-Rotation" statt eines Kanals) - einer Service
-- zuordenbar (Phase 23 Service Catalog ist bereits die etablierte
-- "Owner-Kontext"-Ressource, die Projekt<->Team<->Incidents verbindet;
-- keine neue "Kontext"-Tabelle noetig).
--
-- Race-/Idempotenz-Modell fuer die Ausfuehrung spiegelt exakt
-- alert_events.last_escalated_step (Phase 20): ein einzelner Integer auf
-- dem Vorfall selbst statt einer separaten Log-Tabelle, per Compare-and-
-- Swap-UPDATE fortgeschaltet (db/incidents.repository.ts).
CREATE TABLE escalation_policies (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);
CREATE INDEX idx_escalation_policies_organization_id ON escalation_policies (organization_id);

-- target_type entscheidet, welche der beiden Ziel-Spalten gefuellt ist -
-- "ON_CALL_SCHEDULE" loest bewusst ueber die BEREITS BESTEHENDE
-- Rotationsberechnung auf (core/on-call.ts#resolveCurrentOnCall, identisch
-- zu alert-evaluator.ts#resolveOnCallForStep) statt eine zweite,
-- unscharfe "ganzes Team benachrichtigen"-Broadcast-Logik zu erfinden -
-- On-Call bedeutet immer GENAU EINE verantwortliche Person.
CREATE TABLE escalation_policy_steps (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES escalation_policies(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL CHECK (step_order >= 1),
    delay_minutes INTEGER NOT NULL CHECK (delay_minutes >= 0),
    target_type TEXT NOT NULL CHECK (target_type IN ('USER', 'ON_CALL_SCHEDULE')),
    target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    target_schedule_id BIGINT REFERENCES on_call_schedules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (policy_id, step_order),
    CHECK (
        (target_type = 'USER' AND target_user_id IS NOT NULL AND target_schedule_id IS NULL) OR
        (target_type = 'ON_CALL_SCHEDULE' AND target_schedule_id IS NOT NULL AND target_user_id IS NULL)
    )
);
CREATE INDEX idx_escalation_policy_steps_policy_id ON escalation_policy_steps (policy_id, step_order);

-- Zuordnung "Policy einem Service-Kontext zuordnen" (Auftrag) - ueber die
-- bestehende services-Tabelle (Phase 23), nicht ueber eine neue
-- Zuordnungstabelle. ON DELETE SET NULL: eine geloeschte Policy reisst den
-- Service nicht mit, er hat danach schlicht keine Eskalation mehr.
ALTER TABLE services ADD COLUMN escalation_policy_id BIGINT REFERENCES escalation_policies(id) ON DELETE SET NULL;
CREATE INDEX idx_services_escalation_policy_id ON services (escalation_policy_id) WHERE escalation_policy_id IS NOT NULL;

-- Snapshot statt Live-Aufloesung: die Policy wird EINMAL beim Eroeffnen des
-- Incidents ueber dessen Projekt->Service aufgeloest (core/monitor.ts) und
-- hier festgehalten - eine spaetere Policy-Aenderung am Service darf einen
-- bereits laufenden Eskalationsvorgang nicht rueckwirkend/unvorhersehbar
-- veraendern (dieselbe Snapshot-Ueberlegung wie bei Automation-Ausfuehrungen,
-- die ihre Konfiguration zum Startzeitpunkt festhalten).
ALTER TABLE incidents ADD COLUMN escalation_policy_id BIGINT REFERENCES escalation_policies(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN last_escalated_step INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_incidents_escalation_due ON incidents (escalation_policy_id, last_escalated_step)
    WHERE escalation_policy_id IS NOT NULL AND resolved = false;

-- Keine audit_log-Kategorie-Erweiterung noetig: Escalation-Policy-Mutationen
-- werden bewusst unter der bereits existierenden Kategorie 'ON_CALL' (Phase
-- 24) protokolliert, sie sind fachlich Teil desselben On-Call-Routing-
-- Bereichs - eine weitere, kaum unterscheidbare Kategorie waere Sonder-
-- konzept ohne Mehrwert.
