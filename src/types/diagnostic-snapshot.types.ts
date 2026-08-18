export interface DiagnosticSnapshotCheckEntry {
  checkId: string;
  type: string;
  target: string | null;
  status: string | null;
  responseTimeMs: number | null;
  error: string | null;
  checkedAt: string | null;
}

export interface DiagnosticSnapshotAlertEntry {
  ruleId: number;
  name: string;
  severity: string;
  lastTriggeredValue: string | null;
  lastTriggeredAt: string | null;
}

export interface DiagnosticSnapshotDeploymentEntry {
  id: number;
  version: string;
  environment: string;
  status: string;
  deployedAt: string;
}

// Auftragspunkt 6 "Diagnostic Snapshots" (Phase 10). activeDeployments war
// bis Phase 27 immer [] - ProjectOps hatte keine Deployment-Tracking-
// Funktion (keine erfundenen Daten fuer ein Feature, das im Projekt nicht
// existiert), das Feld blieb strukturell vorbereitet fuer eine spaetere
// Erweiterung. Phase 27 "Enterprise Deployment Tracking & Change
// Correlation" loest dieses vorbereitete Feld ein (siehe incidents/
// diagnostic-snapshot.ts) - enthaelt die Deployments des Projekts im
// Korrelationsfenster vor dem Snapshot-Zeitpunkt (relevanter Kontext fuer
// "war das ein Deployment-bedingter Ausfall?").
export interface DiagnosticSnapshotContent {
  projectId: string;
  projectName: string;
  healthScore: number;
  lastChecks: DiagnosticSnapshotCheckEntry[];
  activeAlerts: DiagnosticSnapshotAlertEntry[];
  activeDeployments: DiagnosticSnapshotDeploymentEntry[];
  generatedAt: string;
}

export interface DiagnosticSnapshot {
  id: number;
  projectId: string;
  incidentId: number | null;
  healthScore: number;
  snapshot: DiagnosticSnapshotContent;
  createdAt: string;
}
