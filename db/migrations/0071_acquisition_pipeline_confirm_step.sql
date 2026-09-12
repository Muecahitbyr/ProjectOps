-- Nutzerwunsch: nach der ersten Ja/Nein-Entscheidung ("Interesse an einer
-- Webseite?") wird die bereits gebaute Webseite erst noch verschickt/gezeigt
-- - der Kontakt kann NACHDEM er sie gesehen hat immer noch ablehnen. Dafuer
-- ein neuer Schritt "Webseite schicken" plus eine zweite, unabhaengige
-- Ja/Nein-Entscheidung. Beide "Nein"-Ausgaenge (vor und nach dem Zeigen)
-- landen in derselben Endzustands-Liste (siehe deriveStage() in
-- acquisition.repository.ts) - fachlich dasselbe Ergebnis (kein Auftrag).
ALTER TABLE acquisition_companies ADD COLUMN website_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE acquisition_companies ADD COLUMN confirmed_after_viewing BOOLEAN;
