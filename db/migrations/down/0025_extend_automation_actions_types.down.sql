ALTER TABLE automation_actions DROP CONSTRAINT automation_actions_action_check;
ALTER TABLE automation_actions ADD CONSTRAINT automation_actions_action_check CHECK (action IN (
    'RESTART_SERVICE', 'CLEAR_CACHE', 'RUN_HEALTH_CHECK'
));
