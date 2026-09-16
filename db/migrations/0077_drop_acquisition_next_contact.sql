-- Wiedervorlage-Feld wieder entfernt (Nutzerwunsch 2026-09-16, kurz nach
-- Einfuehrung in migration 0075) - stattdessen zeigt die Oeffnungszeiten-
-- Anzeige per Klick die ganze Woche (siehe OpeningHoursIndicator.tsx).
ALTER TABLE acquisition_companies DROP COLUMN IF EXISTS next_contact_at;
