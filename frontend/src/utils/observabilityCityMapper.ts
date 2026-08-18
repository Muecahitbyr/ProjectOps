import type { MonitoringAgent } from "../types/monitoring-agent.types";
import type { SystemBackup } from "../types/backup.types";
import type { AuditLogEntry } from "../types/audit.types";
import type { PublicStatusPage } from "../types/status-page.types";
import type { ForecastResult } from "../types/forecast.types";
import type { ObservabilityCityBuildingData } from "../types/observability-city.types";

export interface ObservabilityCityInput {
  agents: MonitoringAgent[];
  backups: SystemBackup[];
  auditEntries: AuditLogEntry[];
  statusPage: PublicStatusPage | undefined;
  healthForecast: ForecastResult | undefined;
  isForecastLoading: boolean;
  isBackupInProgress: boolean;
  isRestoreInProgress: boolean;
}

// Reine Transformationsfunktion (analog zu utils/automationCityMapper.ts) -
// nimmt bereits von Hooks geladene Daten entgegen, keine eigenen
// API-Aufrufe. Phase 13 Teil 12 "Mini City Erweiterung".
export function mapObservabilityToCity(input: ObservabilityCityInput): ObservabilityCityBuildingData[] {
  const { agents, backups, auditEntries, statusPage, healthForecast, isForecastLoading, isBackupInProgress, isRestoreInProgress } = input;

  const onlineAgents = agents.filter((agent) => agent.status === "ONLINE");
  const offlineAgents = agents.filter((agent) => agent.status === "OFFLINE");
  const monitoringHq: ObservabilityCityBuildingData = {
    id: "infra-monitoring-hq",
    name: "Monitoring HQ",
    type: "monitoring-hq",
    status: agents.length === 0 ? "idle" : offlineAgents.length > 0 ? "alert" : "healthy",
    metrics: [
      { label: "Registered agents", value: String(agents.length) },
      { label: "Online", value: String(onlineAgents.length) },
      { label: "Checks (24h)", value: String(agents.reduce((sum, agent) => sum + agent.checkCountLast24h, 0)) },
    ],
  };

  const regions = new Set(agents.map((agent) => agent.region).filter((region): region is string => region !== null));
  const regionalAgents: ObservabilityCityBuildingData = {
    id: "infra-regional-agents",
    name: "Regional Agents",
    type: "regional-agents",
    status: regions.size === 0 ? "idle" : "healthy",
    metrics: [
      { label: "Regions configured", value: String(regions.size) },
      { label: "Agents online", value: String(onlineAgents.length) },
    ],
  };

  const lastBackup = backups[0];
  const backupCenter: ObservabilityCityBuildingData = {
    id: "infra-backup-center",
    name: "Backup Center",
    type: "backup-center",
    status: isBackupInProgress || isRestoreInProgress ? "active" : backups.length === 0 ? "idle" : "healthy",
    metrics: [
      { label: "Total backups", value: String(backups.length) },
      { label: "Last backup", value: lastBackup ? lastBackup.label : "none" },
      { label: "Restored", value: String(backups.filter((backup) => backup.restoredAt !== null).length) },
    ],
  };

  const criticalEntries = auditEntries.filter((entry) => entry.severity === "CRITICAL");
  const auditCenter: ObservabilityCityBuildingData = {
    id: "infra-audit-center",
    name: "Audit Center",
    type: "audit-center",
    status: auditEntries.length === 0 ? "idle" : criticalEntries.length > 0 ? "alert" : "healthy",
    metrics: [
      { label: "Recent events", value: String(auditEntries.length) },
      { label: "Critical", value: String(criticalEntries.length) },
    ],
  };

  const statusCenter: ObservabilityCityBuildingData = {
    id: "infra-status-center",
    name: "Status Center",
    type: "status-center",
    status: !statusPage ? "idle" : statusPage.overallStatus === "operational" ? "healthy" : "alert",
    metrics: [
      { label: "Overall status", value: statusPage?.overallStatus ?? "unknown" },
      { label: "Active incidents", value: String(statusPage?.activeIncidents.length ?? 0) },
    ],
  };

  const predictionLab: ObservabilityCityBuildingData = {
    id: "infra-prediction-lab",
    name: "Prediction Lab",
    type: "prediction-lab",
    status: isForecastLoading ? "active" : !healthForecast || !healthForecast.sufficientData ? "idle" : "healthy",
    metrics: [
      { label: "Model", value: "Linear regression" },
      { label: "Sufficient data", value: healthForecast?.sufficientData ? "yes" : "no" },
    ],
  };

  return [monitoringHq, regionalAgents, backupCenter, auditCenter, statusCenter, predictionLab];
}
