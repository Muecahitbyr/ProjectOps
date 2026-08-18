-- Phase 17 "Enterprise API Write Platform, Idempotency & Safe Automation".
-- Auftragspunkt 4 "Idempotency-Datenbank" - eine Zeile pro versuchtem
-- (Idempotency-Key, API-Key)-Paar. status unterscheidet "wird gerade
-- verarbeitet" von "fertig" (response_status/response_body erst ab dann
-- gesetzt); request_hash erkennt einen wiederverwendeten Key mit
-- ABWEICHENDEM Payload (-> 409 IDEMPOTENCY_KEY_REUSED statt eines
-- stillschweigend falschen Replays).
CREATE TABLE api_idempotency_keys (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    -- Auftragspunkt 20 "Performance" - TTL statt unbegrenztem Wachstum;
    -- Bereinigung laeuft im bestehenden Scheduler-Tick (core/monitor.ts),
    -- kein zusaetzlicher Hintergrund-Poller (siehe core/idempotency-cleanup.ts).
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Auftragspunkt 4 - "Unique Constraint mindestens auf organization_id +
-- api_key_id + idempotency_key". api_key_id impliziert organization_id
-- bereits eindeutig (ein Key gehoert immer zu genau einer Organisation),
-- organization_id ist trotzdem Teil des Index, weil sie auch der
-- primaere Abfragepfad fuer Tenant-Isolation ist.
CREATE UNIQUE INDEX idx_api_idempotency_keys_unique ON api_idempotency_keys (organization_id, api_key_id, idempotency_key);
-- Fuer die periodische Bereinigung abgelaufener Eintraege.
CREATE INDEX idx_api_idempotency_keys_expires_at ON api_idempotency_keys (expires_at);

-- Auftragspunkt 13 "Usage Tracking" - additive Spalten statt einer
-- zweiten, parallelen Usage-Tabelle. mutation unterscheidet lesende von
-- schreibenden Aufrufen (fuer "Write Requests"-Quotas/-Analytics,
-- Auftragspunkt 14/15); idempotency_replay markiert einen Request, der
-- KEINEN echten zweiten Business-Write ausgeloest hat (die urspruengliche
-- Zeile aus dem ersten, echten Versuch bleibt die einzige "echte"
-- Mutation in den Analytics).
ALTER TABLE api_key_usage ADD COLUMN mutation BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE api_key_usage ADD COLUMN idempotency_replay BOOLEAN NOT NULL DEFAULT false;
