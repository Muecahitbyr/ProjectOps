-- Akquise-Pipeline (eigene Sidebar-Seite, Nutzerwunsch): pro Unternehmen ein
-- fester Ablauf "Webseite bauen" -> "Anrufen" -> Ja/Nein-Entscheidung
-- "moechte eine Webseite". Bewusst NICHT konfigurierbar (Nutzerwunsch) -
-- daher zwei feste Bool-Spalten statt einer generischen Schritt-Tabelle.
-- Der abgeleitete Pipeline-Stand (welcher Schritt gerade aktiv ist) wird
-- NICHT gespeichert, sondern in acquisition.repository.ts live aus
-- website_built/called/wants_website berechnet (siehe CLAUDE.md
-- "Derive, don't store").
CREATE TABLE acquisition_companies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    website_built BOOLEAN NOT NULL DEFAULT FALSE,
    called BOOLEAN NOT NULL DEFAULT FALSE,
    -- NULL = Entscheidung steht noch aus, TRUE = "Ja", FALSE = "Nein".
    wants_website BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
