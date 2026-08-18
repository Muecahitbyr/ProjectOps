-- Phase 24 "Enterprise On-Call Scheduling & Escalation Routing". Rein
-- additiv: drei neue Tabellen plus eine nullable Spalte auf der
-- bestehenden alert_escalation_steps-Tabelle (Migration 0020) - keine
-- bestehende Struktur wird geaendert oder entfernt.
--
-- Architekturentscheidung (Auftrag: "Bestehende Systeme maximal
-- wiederverwenden, keine parallelen Systeme"): teams/team_members (Migration
-- 0033) bleiben die alleinige Quelle fuer "wer gehoert zu diesem Team" - ein
-- On-Call-Schedule referenziert Teilnehmer per user_id (siehe
-- on_call_schedule_members unten), es wird KEINE zweite Mitgliederliste
-- gepflegt. Die eigentliche "wer ist JETZT dran"-Berechnung wird bewusst
-- NICHT als Tabelle gefuehrt (keine "on_call_shifts"-Zeile pro Schicht) -
-- bei einer festen Rotation (fester Rotationsstart + Schichtlaenge +
-- geordnete Teilnehmerliste) ist der aktuelle Diensthabende jederzeit aus
-- diesen drei Werten reingerechnet, exakt dasselbe Prinzip wie
-- deriveApiKeyStatus() (Phase 20) / deriveIncidentStatus() (Phase 21) -
-- siehe core/on-call.ts. Nur echte, nicht ableitbare Ausnahmen (jemand
-- uebernimmt kurzfristig eine Schicht) werden als eigene Zeile in
-- on_call_overrides gespeichert.
CREATE TABLE on_call_schedules (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Anders als bei slos/services (Team optional) ist ein On-Call-Schedule
    -- per Definition team-gebunden ("wer ist fuer TEAM X gerade zustaendig")
    -- - NOT NULL ist hier bewusst keine Einschraenkung, sondern die
    -- eigentliche fachliche Bedeutung des Datensatzes.
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    rotation_type TEXT NOT NULL DEFAULT 'WEEKLY' CHECK (rotation_type IN ('DAILY', 'WEEKLY', 'CUSTOM')),
    -- Fuer DAILY/WEEKLY informativ (24 bzw. 168), fuer CUSTOM frei waehlbar -
    -- die eigentliche Rotationsberechnung (core/on-call.ts) nutzt IMMER
    -- shift_length_hours, nie rotation_type selbst (kein zweites,
    -- widerspruechliches Zeitmodell).
    shift_length_hours INTEGER NOT NULL CHECK (shift_length_hours > 0 AND shift_length_hours <= 8760),
    rotation_start TIMESTAMPTZ NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (team_id, name)
);
CREATE INDEX idx_on_call_schedules_organization_id ON on_call_schedules (organization_id);
CREATE INDEX idx_on_call_schedules_team_id ON on_call_schedules (team_id);

-- Geordnete Teilnehmerliste einer Rotation (position 0..n-1, analog zum
-- step_order-Muster von alert_escalation_steps, Migration 0020).
CREATE TABLE on_call_schedule_members (
    id BIGSERIAL PRIMARY KEY,
    schedule_id BIGINT NOT NULL REFERENCES on_call_schedules(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (schedule_id, user_id),
    UNIQUE (schedule_id, position)
);
CREATE INDEX idx_on_call_schedule_members_schedule_id ON on_call_schedule_members (schedule_id, position);

-- Echte, nicht ableitbare Ausnahmen von der berechneten Rotation ("Alice ist
-- im Urlaub, Bob uebernimmt Dienstag 9-18 Uhr"). Ueberlappende Overrides
-- fuer DASSELBE Schedule werden race-sicher per SELECT...FOR UPDATE auf die
-- schedule-Zeile verhindert (db/on-call.repository.ts#createOverrideIfNoOverlap,
-- dasselbe Transaktionsmuster wie createSloIfUnderQuota, Phase 22).
CREATE TABLE on_call_overrides (
    id BIGSERIAL PRIMARY KEY,
    schedule_id BIGINT NOT NULL REFERENCES on_call_schedules(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX idx_on_call_overrides_schedule_range ON on_call_overrides (schedule_id, starts_at, ends_at);

-- Verknuepft bestehende Eskalationsstufen (Migration 0020) optional mit
-- einem On-Call-Schedule: eine Stufe kann weiterhin nur einen Kanal
-- benachrichtigen (channel_id bleibt NOT NULL, unveraendert) und
-- ZUSAETZLICH den aktuell diensthabenden Nutzer des Schedules ermitteln
-- (alerts/alert-evaluator.ts). Nullable - bestehende Eskalationsstufen ohne
-- On-Call-Bezug bleiben unveraendert gueltig.
ALTER TABLE alert_escalation_steps ADD COLUMN on_call_schedule_id BIGINT REFERENCES on_call_schedules(id) ON DELETE SET NULL;
CREATE INDEX idx_alert_escalation_steps_on_call_schedule_id ON alert_escalation_steps (on_call_schedule_id) WHERE on_call_schedule_id IS NOT NULL;

-- Lehre aus Phase 22/23 (siehe Migrationen 0043/0045): die audit_log-Kategorie
-- IN DERSELBEN Migration erweitern, in der sie eingefuehrt wird, statt es zu
-- vergessen und recordAuditLog({category: "ON_CALL"}) bis zur Nachbesserung
-- still fehlschlagen zu lassen.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT',
    'MAINTENANCE', 'BACKUP', 'USER', 'SYSTEM', 'SLO', 'SERVICE', 'ON_CALL'
));
