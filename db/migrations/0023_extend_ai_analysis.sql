-- Auftragspunkt 8 ("AI Incident Assistant Erweiterung"): zusaetzliche,
-- rein additive Spalten. summary/root_cause/recommendation (Phase 2)
-- bleiben unveraendert die kurze Zusammenfassung/Ursache/erster Schritt;
-- affected_systems/recommended_steps/confidence_score sind fuer bestehende
-- Zeilen NULL (kein rueckwirkendes Neu-Analysieren alter Incidents).
ALTER TABLE ai_analysis
    ADD COLUMN affected_systems JSONB,
    ADD COLUMN recommended_steps JSONB,
    ADD COLUMN confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1);
