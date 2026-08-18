-- Phase 19 "Enterprise Observability, API Analytics & Operational
-- Intelligence" Auftragspunkt 1 "API Usage Analytics". Der Auftrag verlangt
-- eine neue Tabelle "api_usage_events" mit organizationId/apiKeyId/userId/
-- endpoint/method/statusCode/responseTime/timestamp/requestSize/
-- responseSize sowie Indizes auf organization_id/api_key_id/created_at/
-- endpoint.
--
-- api_key_usage (Migration 0034, erweitert in 0035/0036/0037) erfasst
-- bereits GENAU dieselben Kernfelder (organization_id, api_key_id,
-- endpoint, method, status_code, duration_ms, created_at) fuer JEDEN
-- authentifizierten /api/v1-Request, geschrieben ueber genau denselben
-- Fire-and-Forget-Mechanismus (middleware/api-key-auth.ts trackApiUsage),
-- den Auftragspunkt 3 hier explizit wieder verlangt. Eine zweite Tabelle
-- mit denselben Spalten, befuellt am selben Ort im selben Request-Zyklus,
-- waere exakt das per "WICHTIG: Keine parallelen Systeme erstellen"
-- verbotene Duplikat (doppelte Schreiblast pro Request, zwei Quellen der
-- Wahrheit fuer "wie viele Requests hatte dieser Key heute"). Diese
-- Migration erweitert daher die bestehende Tabelle additiv um exakt die
-- drei fehlenden Felder (user_id, request/response Groesse) statt eine
-- zweite anzulegen - alle vier geforderten Indizes (organization_id,
-- api_key_id, created_at, endpoint) existieren bereits (0034/0035).
ALTER TABLE api_key_usage ADD COLUMN created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE api_key_usage ADD COLUMN request_size_bytes INTEGER;
ALTER TABLE api_key_usage ADD COLUMN response_size_bytes INTEGER;

-- Auftragspunkt 1 "Keine Secrets speichern" - explizit dokumentiert: es
-- gibt und wird KEINE Spalte fuer den API-Key-Klartext, den Authorization-
-- Header oder sonstige Tokens geben. Nur die bereits bestehende, sichere
-- Kennung api_key_id (Fremdschluessel) wird gespeichert.
