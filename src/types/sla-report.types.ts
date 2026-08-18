import type { ProjectSla } from "./analytics.types";

// Phase 13 Teil 6 "SLA Reports" - buendelt die bereits bestehende
// getProjectSla() (analytics.repository.ts) mit Vorfall-/Alert-/
// Automation-Zaehlungen im selben Zeitfenster. Export (PDF/Excel/CSV/JSON)
// passiert im Frontend ueber das bestehende utils/export.ts - hier wird nur
// die Rohdaten-Struktur geliefert.
export interface SlaReport {
  projectId: string;
  projectName: string;
  sla: ProjectSla;
  incidentCount: number;
  alertTriggerCount: number;
  automationExecutionCount: number;
  generatedAt: string;
}
