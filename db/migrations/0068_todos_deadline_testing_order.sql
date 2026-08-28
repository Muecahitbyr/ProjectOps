-- Drei Nutzerwuensche zu Todos:
-- 1. due_date: optionale Deadline ("erledigen bis...").
-- 2. needs_testing: beim Abhaken wird gefragt "muss das getestet werden?".
--    true = haengt gerade im separaten "Zu testen"-Bereich (siehe Frontend),
--    unabhaengig vom eigentlichen done-Feld, das erst beim tatsaechlichen
--    Testen-Abhaken auf true gesetzt wird.
-- 3. position: manuell änderbare Reihenfolge (Rauf/Runter im Frontend) -
--    Default = id, damit bestehende Zeilen ohne Zusatzarbeit ihre bisherige
--    (zeitliche) Reihenfolge behalten.
ALTER TABLE todos ADD COLUMN due_date DATE;
ALTER TABLE todos ADD COLUMN needs_testing BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE todos ADD COLUMN position BIGINT;

UPDATE todos SET position = id WHERE position IS NULL;
ALTER TABLE todos ALTER COLUMN position SET NOT NULL;

CREATE INDEX idx_todos_position ON todos (position);
CREATE INDEX idx_todos_needs_testing ON todos (needs_testing);
