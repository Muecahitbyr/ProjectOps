-- Phase 31 "Enterprise Change/Incident Communication & Stakeholder
-- Notification Intelligence" - Bestandsanalyse ergab: die bestehende
-- Notification-Infrastruktur (notification_events, Migration 0029) ist
-- PROJEKTWEITER Broadcast ueber vier feste Kanaele (EMAIL/PUSH/IN_APP/
-- WEBSOCKET, notification_channels, Migration 0014), keine an einen
-- KONKRETEN Empfaenger (User/On-Call-Schedule) adressierte, auditierbare
-- Nachricht mit Historie. Genau das fehlt fuer "Stakeholder Communication".
-- Kein zweites Notification-System: incident_communications referenziert
-- dieselbe notification_channels-Tabelle (optionaler Kanal-Tag), dieselbe
-- users/on_call_schedules-Tabellen fuer Ziele, dieselbe Timeline
-- (event_type 'NOTIFICATION_SENT' existiert bereits, Migration 0041) und
-- denselben audit_log (Kategorie 'NOTIFICATION', bereits vorhanden).
--
-- target_type/target_user_id/target_schedule_id mirrort exakt das bereits
-- etablierte Muster aus escalation_policy_steps (Migration 0049) - On-Call
-- loest ueber die BESTEHENDE Rotationsberechnung auf (core/on-call.ts),
-- keine zweite "Team benachrichtigen"-Logik. 'GENERAL' (kein Empfaenger -
-- eine allgemeine Stakeholder-Nachricht ohne konkrete Zielperson) ist neu,
-- weil eine Kommunikation - anders als eine Eskalationsstufe - nicht
-- zwingend eine einzelne verantwortliche Person braucht.
CREATE TABLE incident_communications (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
    target_type TEXT NOT NULL CHECK (target_type IN ('USER', 'ON_CALL_SCHEDULE', 'GENERAL')),
    target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    target_schedule_id BIGINT REFERENCES on_call_schedules(id) ON DELETE SET NULL,
    -- Optional UND unabhaengig vom Ziel: "ueber welchen bestehenden Kanaltyp
    -- wurde dies zusaetzlich versendet" (siehe core/incident-communication.ts
    -- fuer die ehrliche Einschraenkung, dass EMAIL/PUSH weiterhin an die
    -- bereits bestehende, projektweite Zieladresse gehen, nicht persoenlich
    -- an den Empfaenger - dieselbe Grenze wie bei ALERT_ESCALATED).
    notification_channel_id TEXT REFERENCES notification_channels(id) ON DELETE SET NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (target_type = 'USER' AND target_user_id IS NOT NULL AND target_schedule_id IS NULL) OR
        (target_type = 'ON_CALL_SCHEDULE' AND target_schedule_id IS NOT NULL AND target_user_id IS NULL) OR
        (target_type = 'GENERAL' AND target_user_id IS NULL AND target_schedule_id IS NULL)
    )
);
CREATE INDEX idx_incident_communications_incident_id ON incident_communications (incident_id, created_at DESC);

-- Auftragspunkt 7 "Deduplication/Idempotency" - DB-autoritativ: eine exakt
-- identische Kommunikation (gleiches Ziel + Kanal + Nachrichtentext) fuer
-- denselben Incident kann nie doppelt existieren. md5(message) haelt den
-- Index kompakt (message ist unbegrenzter Text). Der weichere, zeitbasierte
-- Cooldown ("kein AEHNLICHER Versand an dasselbe Ziel binnen N Minuten",
-- unabhaengig vom exakten Text) ist bewusst NICHT Teil dieser Constraint -
-- das ist eine Lesepruefung im Safety-Gate (core/incident-communication.ts),
-- da ein Zeitfenster relativ zu "jetzt" nicht als immutabler Index-Ausdruck
-- formulierbar ist. Zehn parallele, IDENTISCHE Anfragen treffen alle auf
-- denselben Index-Eintrag - die erste gewinnt, alle anderen erhalten
-- Fehlercode 23505 (siehe etabliertes Abfangen in service-dependencies.
-- repository.ts/automation-executions.repository.ts).
CREATE UNIQUE INDEX idx_incident_communications_dedup ON incident_communications (
    incident_id,
    target_type,
    COALESCE(target_user_id, '~'),
    COALESCE(target_schedule_id, -1),
    COALESCE(notification_channel_id, '~'),
    md5(message)
);
