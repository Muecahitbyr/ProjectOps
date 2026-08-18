DROP INDEX IF EXISTS idx_root_incidents_open_by_cause;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_check_id_fkey;
-- Die per DELETE entfernten verwaisten Zeilen werden bewusst nicht
-- wiederhergestellt (sie waren bereits ungueltig).
