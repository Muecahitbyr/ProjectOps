// Teil 8 "Mini City" (Phase 11) - eigenstaendiges Status-Modell (idle/
// running/waiting_approval/failed/healthy), bewusst GETRENNT von
// types/city.types.ts (HealthStatus: healthy/warning/critical). Eine
// Wiederverwendung des bestehenden CityBuilding-Typs haette entweder
// HealthStatus um automatisierungsspezifische Werte erweitert (bricht jede
// bestehende Stelle, die HealthStatus als healthy/warning/critical
// annimmt) oder die neuen Status auf die alten gemappt (Informationsverlust,
// z.B. "waiting_approval" vs. "running" waeren nicht mehr unterscheidbar).
export type AutomationBuildingStatus = "idle" | "running" | "waiting_approval" | "failed" | "healthy";

export type AutomationBuildingType = "automation-center" | "self-healing-unit" | "approval-office" | "robot-factory";

export interface AutomationCityBuildingMetric {
  label: string;
  value: string;
}

export interface AutomationCityBuildingData {
  id: string;
  name: string;
  type: AutomationBuildingType;
  status: AutomationBuildingStatus;
  metrics: AutomationCityBuildingMetric[];
}
