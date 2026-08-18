// Phase 13 Teil 3+4 "Public Status Page" / "Status History" - bewusst
// eigene, stark reduzierte Typen (nur was oeffentlich sein darf). Niemals
// User-, AI- oder Automation-Daten.
export type PublicIncidentStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance";

export interface PublicProjectStatus {
  id: string;
  name: string;
  status: PublicIncidentStatus;
  uptimePercent24h: number;
  uptimePercent90d: number;
  activeMaintenance: { reason: string; endsAt: string } | null;
}

export interface PublicIncidentSummary {
  projectId: string;
  projectName: string;
  title: string;
  severity: string;
  startedAt: string;
  resolvedAt: string | null;
}

export interface PublicStatusPage {
  generatedAt: string;
  overallStatus: PublicIncidentStatus;
  projects: PublicProjectStatus[];
  activeIncidents: PublicIncidentSummary[];
  upcomingMaintenance: Array<{ projectId: string; projectName: string; reason: string; startsAt: string; endsAt: string }>;
}

export interface PublicStatusHistoryBucket {
  bucketStart: string;
  status: PublicIncidentStatus;
  uptimePercent: number;
  averageResponseTimeMs: number | null;
}

export interface PublicStatusHistory {
  projectId: string;
  rangeDays: number;
  buckets: PublicStatusHistoryBucket[];
}
