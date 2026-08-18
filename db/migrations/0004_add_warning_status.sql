ALTER TABLE check_results DROP CONSTRAINT check_results_status_check;

ALTER TABLE check_results
    ADD CONSTRAINT check_results_status_check
    CHECK (status IN ('ONLINE', 'WARNING', 'OFFLINE', 'ERROR'));
