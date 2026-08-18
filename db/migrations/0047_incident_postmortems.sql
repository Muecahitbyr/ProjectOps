-- Phase 26 "Enterprise Incident Postmortems & Retrospectives". Rein additiv:
-- zwei neue Tabellen, keine bestehende Struktur wird geaendert. Schliesst
-- den Incident-Response-Kreislauf (Phase 21 "Enterprise Alerting, Incident
-- Response & Notification Orchestration"): Incidents haben bereits vollen
-- Lifecycle (OPEN/ACKNOWLEDGED/RESOLVED) und eine Timeline
-- (incident_timeline_events), aber keine Moeglichkeit, nach dem Resolve
-- strukturiert aufzuarbeiten (Root Cause/Impact/Action Items) - genau die
-- Luecke, die diese Phase schliesst.
--
-- Architekturentscheidung: EIN Postmortem pro Incident (nicht pro
-- Root-Incident-Korrelationsgruppe, Migration 0021) - haelt den Scope klar
-- und deckt den weit ueberwiegenden Regelfall ab; eine spaetere Erweiterung
-- auf Root-Incidents waere additiv moeglich, ist aber kein aktueller Bedarf.
-- Bewusst KEINE eigene "status"-Ableitungslogik wie deriveIncidentStatus() -
-- hier gibt es keinen redundant speicherbaren Zustand (DRAFT/IN_REVIEW/
-- PUBLISHED ist ein echter, vom Autor gewaehlter Arbeitsfluss-Zustand, kein
-- aus anderen Spalten ableitbarer Wert wie bei Incidents/API-Keys).
CREATE TABLE incident_postmortems (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_REVIEW', 'PUBLISHED')),
    summary TEXT,
    impact TEXT,
    root_cause TEXT,
    resolution TEXT,
    timeline_notes TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- incident_id ist bereits UNIQUE (impliziter Index) - das ist zugleich der
-- race-sichere Mechanismus fuer "genau ein Postmortem pro Incident": ein
-- INSERT ... ON CONFLICT (incident_id) DO NOTHING (db/postmortems.repository.ts)
-- macht ein SELECT...FOR UPDATE ueberfluessig, die Unique-Constraint selbst
-- serialisiert gleichzeitige Erstellungsversuche auf DB-Ebene.

CREATE TABLE incident_postmortem_action_items (
    id BIGSERIAL PRIMARY KEY,
    postmortem_id BIGINT NOT NULL REFERENCES incident_postmortems(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_postmortem_action_items_postmortem_id ON incident_postmortem_action_items (postmortem_id);
CREATE INDEX idx_incident_postmortem_action_items_assignee_id ON incident_postmortem_action_items (assignee_id) WHERE assignee_id IS NOT NULL;
