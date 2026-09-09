-- Nutzerwunsch: "Ja" bei der Webseiten-Entscheidung ist kein Endzustand mehr
-- (die bisherige "Webseite gewuenscht"-Liste faellt weg) - die Firma bleibt
-- stattdessen in "In Bearbeitung" und durchlaeuft drei weitere feste
-- Schritte: Planung -> Umsetzung -> Live/Fertig. Nur "Nein" bleibt ein
-- Endzustand (siehe acquisition.repository.ts deriveStage()).
ALTER TABLE acquisition_companies ADD COLUMN planning_done BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE acquisition_companies ADD COLUMN implementation_done BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE acquisition_companies ADD COLUMN live BOOLEAN NOT NULL DEFAULT FALSE;
