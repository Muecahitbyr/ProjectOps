// Phase 13 Teil 12 "Mini City Erweiterung" - eigenstaendiges Status-Modell,
// analog zu automation-city.types.ts (siehe dortige Begruendung): eine
// dritte Domaene (Monitoring/Backup/Audit/Status/Prediction) haette bei
// Wiederverwendung von AutomationBuildingStatus bedeutungslose Werte wie
// "waiting_approval" fuer ein Backup-Center geerbt.
export type ObservabilityBuildingStatus = "idle" | "active" | "alert" | "healthy";

export type ObservabilityBuildingType =
  | "monitoring-hq"
  | "regional-agents"
  | "backup-center"
  | "audit-center"
  | "status-center"
  | "prediction-lab"
  // Phase 14 "Mini City Erweiterung" (Cluster District) - dieselben
  // idle/active/alert/healthy-Status passen unveraendert (active = Rolling
  // Update/Failover laeuft, alert = Agent ausgefallen/Split-Brain), daher
  // hier additiv erweitert statt ein weiteres, paralleles Status-Modell
  // anzulegen.
  | "primary-node"
  | "remote-agents-hub"
  | "scheduler"
  | "cluster-controller"
  | "update-center"
  | "failover-center"
  // Phase 15 "Mini City Erweiterung" (Enterprise District) - dieselben
  // idle/active/alert/healthy-Status passen unveraendert (active = gerade
  // eingehende Organisations-/Team-/Webhook-/API-Aktivitaet, alert = Webhook
  // Dead Letter Queue nicht leer), daher hier erneut additiv erweitert
  // statt eines weiteren, parallelen Status-Modells.
  | "organizations-hall"
  | "teams-hub"
  | "api-gateway-tower"
  | "webhook-center"
  | "platform-admin-tower"
  | "service-accounts-vault";

export interface ObservabilityCityBuildingMetric {
  label: string;
  value: string;
}

export interface ObservabilityCityBuildingData {
  id: string;
  name: string;
  type: ObservabilityBuildingType;
  status: ObservabilityBuildingStatus;
  metrics: ObservabilityCityBuildingMetric[];
}
