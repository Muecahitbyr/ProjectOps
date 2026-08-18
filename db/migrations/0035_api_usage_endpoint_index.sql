-- Phase 16 (2. Iteration) Auftragspunkt 4/15 "API Usage Tracking"/
-- "Performance" - dritter geforderter Index (endpoint + created_at), ergaenzt
-- die beiden bereits in Migration 0034 vorhandenen Indizes (api_key_id,
-- organization_id). Deckt die "Top Endpoints"-Aggregation (db/api-key-
-- usage.repository.ts, GROUP BY endpoint) sowie zukuenftige
-- Retention-/Aufraeum-Jobs pro Endpunkt ab.
CREATE INDEX idx_api_key_usage_endpoint ON api_key_usage (endpoint, created_at DESC);
