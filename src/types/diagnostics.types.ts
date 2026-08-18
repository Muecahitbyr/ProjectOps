// Phase 13 Teil 11 "Diagnostics Center" / Teil 9 "Disaster Recovery" - alle
// Werte werden zur Laufzeit aus dem echten Prozess/System gelesen (process.*,
// os.*, pool-Status, ...), keine hartkodierten Anzeigewerte.
export interface DiagnosticsSubsystemStatus {
  name: string;
  healthy: boolean;
  detail: string;
}

export interface DiagnosticsSnapshot {
  backendVersion: string;
  frontendVersion: string | null;
  gitCommit: string | null;
  environment: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  dockerized: boolean;
  dockerVersion: string | null;
  postgresVersion: string | null;
  memory: { usedMb: number; totalMb: number; rssMb: number };
  cpuLoadPercent: number | null;
  uptimeSeconds: number;
  subsystems: DiagnosticsSubsystemStatus[];
}

export type DisasterRecoveryStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface DisasterRecoverySignal {
  name: string;
  healthy: boolean;
  detail: string;
}

export interface DisasterRecoveryReport {
  status: DisasterRecoveryStatus;
  generatedAt: string;
  signals: DisasterRecoverySignal[];
}
