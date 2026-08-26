-- Nutzerwunsch: Todos sollen nicht auf die vier echten ueberwachten Projekte
-- (driveconnect/rechno/guess-the-capital-city/bayar-solutions) beschraenkt
-- sein, sondern auch andere eigene Vorhaben/Firmen (z.B. "cmd
-- Gebaeudereinigung", "mehdi") als freie Kategorie tragen koennen, die es
-- in der projects-Tabelle gar nicht gibt. project_id war bisher ein FK auf
-- projects(id) - dafuer ungeeignet, daher zu einem freien Textfeld
-- umbenannt (kein Cleanup/Migrationsverlust: bisherige Werte, die echten
-- Projekt-Ids entsprachen, bleiben als Text erhalten).
ALTER TABLE todos DROP CONSTRAINT todos_project_id_fkey;
ALTER TABLE todos RENAME COLUMN project_id TO category;
ALTER INDEX idx_todos_project_id RENAME TO idx_todos_category;
