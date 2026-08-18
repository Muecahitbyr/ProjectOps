-- Phase 32 "Enterprise Incident Command Center & Operational Coordination" -
-- Bestandsanalyse ergab: Escalation (Phase 27), Recovery (Phase 30),
-- Communication (Phase 31), Change Risk (Phase 29), Blast Radius (Phase 25),
-- Postmortem (Phase 26) und Timeline (Phase 21) sind bereits vollstaendig
-- vorhanden - das Command Center baut AUSSCHLIESSLICH eine duenne
-- Aggregations-/Koordinationsschicht darueber (core/incident-command.ts),
-- keine dieser Engines wird dupliziert. Echte Luecke: es gibt keinerlei
-- Struktur fuer "wer fuehrt diesen Incident gerade" (Commander/Technical
-- Lead/Communications Lead) und keine operative Checkliste.
--
-- incident_command_roles: EIN Rollen-Slot je (Incident, Rolle) - "es gibt
-- IMMER hoechstens einen aktuellen Commander", aber dieselbe Person KANN
-- mehrere Rollen gleichzeitig halten (kein UNIQUE auf user_id, nur auf
-- role). UPSERT via ON CONFLICT (incident_id, role) DO UPDATE ist die
-- race-sichere, deterministische Zuweisung (Auftragspunkt 19 "Race Safety"):
-- bei zwei parallelen "setze Commander"-Anfragen gewinnt genau eine, die DB
-- serialisiert - niemals ein inkonsistenter Zwischenzustand.
CREATE TABLE incident_command_roles (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('INCIDENT_COMMANDER', 'TECHNICAL_LEAD', 'COMMUNICATIONS_LEAD')),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (incident_id, role)
);
CREATE INDEX idx_incident_command_roles_incident_id ON incident_command_roles (incident_id);

-- incident_command_checklist_items: nur tatsaechlich veraenderte Eintraege
-- werden gespeichert (Auftragspunkt 5 "Checklist darf keine bestehenden
-- Funktionen duplizieren, nur den operativen Zustand zusammenfassen") - die
-- neun Standard-Items (siehe types/incident-command.types.ts) werden fuer
-- fehlende Zeilen zur Laufzeit als Default OPEN abgeleitet (core/incident-
-- command.ts), NICHT beim Anlegen eines Incidents vorab in die DB
-- geschrieben - kein Datenmuell fuer Incidents, deren Checklist nie
-- angefasst wird.
CREATE TABLE incident_command_checklist_items (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL CHECK (item_key IN (
        'COMMANDER_ASSIGNED', 'TECHNICAL_LEAD_ASSIGNED', 'COMMUNICATION_ASSESSED',
        'STAKEHOLDERS_NOTIFIED', 'BLAST_RADIUS_REVIEWED', 'RECENT_CHANGES_REVIEWED',
        'RECOVERY_ACTIONS_REVIEWED', 'ESCALATION_REVIEWED', 'POSTMORTEM_REQUIRED'
    )),
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'DONE', 'SKIPPED')),
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (incident_id, item_key)
);
CREATE INDEX idx_incident_command_checklist_incident_id ON incident_command_checklist_items (incident_id);
