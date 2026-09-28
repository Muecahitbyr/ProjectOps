-- "Kunden Finden": echter DB-seitiger Dedupe-Schutz statt nur eines
-- SELECT-vorher-INSERT-Checks in der Anwendung (createCustomerFinderResults()
-- in customer-finder.repository.ts). Der App-seitige Check hatte ein
-- TOCTOU-Zeitfenster: zwei nahezu gleichzeitige Suchen fuer dieselbe
-- Branche+Stadt (z.B. zwei schnelle Klicks, siehe Race-Condition-Analyse
-- im Kundenfinder-Bericht 2026-09-28) haetten beide denselben "noch nicht
-- vorhanden"-Zustand gesehen und den Treffer trotzdem doppelt eingefuegt.
-- Ein partieller Unique-Index macht das Einfuegen selbst race-sicher -
-- createCustomerFinderResults() nutzt jetzt INSERT ... ON CONFLICT DO
-- NOTHING statt der vorherigen SELECT-Vorabpruefung.
--
-- Vor dieser Migration wurde in Produktion verifiziert, dass keine
-- Bestandsdaten verletzt werden (0 verbleibende Duplikate nach der
-- manuellen Bereinigung vom selben Tag).
CREATE UNIQUE INDEX idx_customer_finder_results_dedupe
  ON customer_finder_results (lower(trim(name)), lower(trim(coalesce(address, ''))));
