import { AutomationExecutionsTable } from "./AutomationExecutionsTable";

// Teil 3 "Automation Dashboard" - jeder einzelne Ausfuehrungsversuch
// (Klick fuer Live-/Verlaufs-Logs, siehe ExecutionDetailDialog). Fuer den
// Entscheidungs-Verlauf pro Vorschlag (PROPOSED/APPROVED/REJECTED) siehe
// den History-Tab (AutomationHistoryTab.tsx).
export function AutomationExecutionsTab() {
  return (
    <AutomationExecutionsTable
      statusFilterOptions={["CREATED", "APPROVED", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"]}
      emptyMessage="No automation executions yet."
    />
  );
}
