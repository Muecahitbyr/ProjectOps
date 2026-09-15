-- Nisan: Gaesteliste fuer die Verlobung (eigene Sidebar-Seite, Nutzerwunsch).
-- Zwei feste Listen (host) statt einer generischen Gruppen-Tabelle, analog
-- zur festen Zwei-Werte-Modellierung in acquisition_companies.
CREATE TABLE nisan_guests (
    id BIGSERIAL PRIMARY KEY,
    host TEXT NOT NULL CHECK (host IN ('MUECAHIT', 'GOENUEL')),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nisan_guests_host ON nisan_guests (host);
