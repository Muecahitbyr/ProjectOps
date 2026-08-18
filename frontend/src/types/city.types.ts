import type { HealthStatus } from "./common.types";

// App Tower/Website = ein Gebaeude pro Projekt (aus GET /api/dashboard/projects).
// Database Center/API Gateway = Aggregation bestimmter Check-Typen ueber alle
// Projekte hinweg (aus GET /api/dashboard/projects/:id). AI/Notification
// Center = aus GET /api/dashboard (summary.aiAnalyses/notifications).
export type CityBuildingType =
  | "app-tower"
  | "website"
  | "database-center"
  | "api-gateway"
  | "ai-center"
  | "notification-center";

export interface CityBuildingMetric {
  label: string;
  value: string;
}

export interface CityBuilding {
  id: string;
  name: string;
  type: CityBuildingType;
  status: HealthStatus;
  healthScore: number;
  // null bei Infrastruktur-Gebaeuden (Database Center, API Gateway, AI
  // Center, Notification Center), die kein einzelnes Projekt repraesentieren.
  linkedProjectId: string | null;
  metrics: CityBuildingMetric[];
}
