ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;

-- Bestehende Projekte haben die Beschreibung bereits in der config-Spalte.
UPDATE projects SET description = config->>'description' WHERE description IS NULL;
