-- Oeffnungszeiten (Nutzerwunsch 2026-09-16): der Scraper liefert sie bereits
-- pro Treffer (CSV-Spalte "open_hours", JSON wie
-- {"Montag":["09:00-18:00"],"Sonntag":["Geschlossen"]}) - bisher gingen sie
-- beim Import verloren. Rohes JSON als TEXT gespeichert, Parsing/Anzeige
-- (inkl. "jetzt geoeffnet?") passiert im Frontend (siehe
-- frontend/src/utils/openingHours.ts) - kein Bedarf, das serverseitig
-- vorzuverarbeiten.
ALTER TABLE customer_finder_results ADD COLUMN opening_hours TEXT;
ALTER TABLE acquisition_companies ADD COLUMN opening_hours TEXT;
