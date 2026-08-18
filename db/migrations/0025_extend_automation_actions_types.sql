-- Phase 10 "Automation Engine Foundation": zwei neue, bewusst ungefaehrliche
-- Aktionstypen (CREATE_DIAGNOSTIC_SNAPSHOT, COLLECT_LOGS) ergaenzen die
-- bestehenden drei aus Phase 9. RESTART_SERVICE/CLEAR_CACHE bleiben reine
-- Vorschlaege ohne Ausfuehrungspfad (siehe automation_rules unten).
ALTER TABLE automation_actions DROP CONSTRAINT automation_actions_action_check;
ALTER TABLE automation_actions ADD CONSTRAINT automation_actions_action_check CHECK (action IN (
    'RESTART_SERVICE', 'CLEAR_CACHE', 'RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS'
));
