-- Neuer Sidebar-Reiter "Bewerbungen" (Nutzerwunsch 2026-11-11): Tracking der
-- eigenen Job-Bewerbungen, Hauptzweck laut Nutzer ist eine Suchfunktion
-- ("vor dem Bewerben nachschauen, ob ich mich dort schon beworben habe").
-- Eigenstaendige, flache Liste ohne Fremdschluessel - dieselbe "Shared Ops
-- Console"-Konvention wie client_projects/nisan_guests/acquisition_companies
-- (kein projektbezogenes RBAC, nur authenticate).
--
-- status bewusst nicht aus einem Datum abgeleitet (anders als z.B. Service
-- Health) - "Absage"/"Zusage"/offen ist eine externe Entscheidung Dritter,
-- die nirgendwo sonst im System steht, also echte gespeicherte Information,
-- kein abgeleiteter Wert.
CREATE TABLE job_applications (
    id BIGSERIAL PRIMARY KEY,
    company TEXT NOT NULL,
    position TEXT,
    applied_at DATE,
    location TEXT,
    interview_note TEXT,
    status TEXT NOT NULL DEFAULT 'OFFEN' CHECK (status IN ('OFFEN', 'ABSAGE', 'ZUSAGE')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitiv/trim-tolerant: Grundlage fuer die "schon beworben?"-Suche
-- vor einer neuen Bewerbung.
CREATE INDEX idx_job_applications_company ON job_applications (lower(trim(company)));
