-- Phase 51 "Enterprise Decision Execution & Closed-Loop Operations" -
-- core/automation-outcome-verification.ts sweept periodisch kuerzlich
-- erfolgreich abgeschlossene Automation-Executions (status='SUCCESS',
-- finished_at in einem begrenzten Rueckblickfenster), um deren operatives
-- Ergebnis zu verifizieren (Execution Success != Outcome Success,
-- Auftragspunkt 7). Ohne diesen Index waere die periodische Sweep-Abfrage
-- ein Full-Table-Scan, der mit wachsender Execution-Historie zunehmend
-- teuer wuerde - derselbe vorausschauende Index-Ansatz wie bei jeder anderen
-- neu eingefuehrten periodischen Abfrage in diesem System (siehe
-- idx_audit_log_project_id, Phase 44).
CREATE INDEX IF NOT EXISTS idx_automation_executions_status_finished_at
    ON automation_executions (status, finished_at)
    WHERE status = 'SUCCESS';
