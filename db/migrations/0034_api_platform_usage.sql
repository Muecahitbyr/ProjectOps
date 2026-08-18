-- Phase 16 "Enterprise API Platform, API-Key Authentication, Quotas & Usage
-- Enforcement". Additiv zu Migration 0033: api_keys existierte bereits
-- (Verwaltung), wurde aber von keinem Endpunkt tatsaechlich zur
-- Authentifizierung verwendet (recordApiKeyUsage() war definiert, aber
-- unbenutzt - siehe Phase-15-Abschlussbericht, Punkt 12). Diese Migration
-- macht API-Keys erstmals wirklich nutzbar.

-- Auftragspunkt 10 "API-Key Management UI" - "optional Team zuordnen".
-- Nullable: ein API-Key kann weiterhin ohne Team-Zuordnung erstellt werden
-- (organisationsweiter Zugriff), bestehende Keys aus Phase 15 bleiben
-- gueltig (team_id = NULL = unveraendertes Verhalten).
ALTER TABLE api_keys ADD COLUMN team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX idx_api_keys_team_id ON api_keys (team_id) WHERE team_id IS NOT NULL;

-- Auftragspunkt 5/6 "API-Key Usage Tracking"/"Usage Analytics" - eine
-- dedizierte Tabelle statt Zweckentfremdung von audit_log: audit_log ist
-- fuer sicherheitsrelevante, seltene Ereignisse gedacht (siehe
-- core/audit-log.ts), api_key_usage dagegen fuer hochfrequente, einfache
-- Zeilen pro API-Aufruf (Endpoint/Methode/Statuscode/Dauer) - andere
-- Schreibfrequenz, andere Aufbewahrung, andere Abfragen (Aggregation ueber
-- Zeitfenster statt einzelne Ereignis-Historie). api_keys.usage_count
-- bleibt als schneller Gesamtzaehler bestehen (Phase 15); diese Tabelle
-- liefert zusaetzlich die Aufschluesselung nach Endpoint/Status/Zeit, die
-- ein einzelner Zaehler nicht leisten kann.
CREATE TABLE api_key_usage (
    id BIGSERIAL PRIMARY KEY,
    api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Deckt sowohl "pro Key ueber Zeit" (Quota-Zaehlung, Last-Used-Trends) als
-- auch "pro Organisation ueber Zeit" (Tenant-/Platform-Usage-Analytics) ab.
CREATE INDEX idx_api_key_usage_api_key_id ON api_key_usage (api_key_id, created_at DESC);
CREATE INDEX idx_api_key_usage_organization_id ON api_key_usage (organization_id, created_at DESC);
