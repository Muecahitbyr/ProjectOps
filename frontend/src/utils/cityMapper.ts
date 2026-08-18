import type { HealthStatus } from "../types/common.types";
import type { DashboardSummary, ProjectHealthSummary } from "../types/dashboard.types";
import type { ProjectCheckDetail, ProjectDashboardDetail } from "../types/project.types";
import type { CityBuilding, CityBuildingMetric, CityBuildingType } from "../types/city.types";

// Welche Check-Typen zu welchem Infrastruktur-Gebaeude gehoeren. Checks, die
// in keiner der beiden Listen vorkommen (ssl, dns, response-time, stripe),
// haben kein eigenes Gebaeude - sie fliessen trotzdem in die Health des
// jeweiligen Projekt-Gebaeudes (App Tower/Website) ein.
const DATABASE_CHECK_TYPES = ["firebase-status", "firestore"];
const API_CHECK_TYPES = ["api-health", "http"];

function projectTypeToBuildingType(projectType: string): CityBuildingType {
  return projectType === "website" ? "website" : "app-tower";
}

function buildProjectBuildings(projects: ProjectHealthSummary[]): CityBuilding[] {
  return projects.map((project) => ({
    id: `project-${project.id}`,
    name: project.name,
    type: projectTypeToBuildingType(project.type),
    status: project.health.status,
    healthScore: project.health.score,
    linkedProjectId: project.id,
    metrics: [
      { label: "Status", value: project.health.status.toUpperCase() },
      { label: "Health", value: `${project.health.score}%` },
      { label: "Checks", value: `${project.checks.error} von ${project.checks.total} fehlerhaft` },
      { label: "Offene Incidents", value: String(project.openIncidents) },
    ],
  }));
}

interface CheckAggregate {
  status: HealthStatus;
  healthScore: number;
  total: number;
  errorCount: number;
}

function aggregateChecks(checks: ProjectCheckDetail[]): CheckAggregate {
  let online = 0;
  let warning = 0;
  let errorCount = 0;

  for (const check of checks) {
    if (check.status === "ONLINE") online++;
    else if (check.status === "WARNING") warning++;
    else if (check.status === "ERROR" || check.status === "OFFLINE") errorCount++;
  }

  const total = checks.length;
  const status: HealthStatus = errorCount > 0 ? "critical" : warning > 0 ? "warning" : "healthy";
  const healthScore = total > 0 ? Math.round((online / total) * 100) : 100;

  return { status, healthScore, total, errorCount };
}

function buildInfrastructureBuilding(
  type: CityBuildingType,
  name: string,
  checks: ProjectCheckDetail[],
): CityBuilding {
  const aggregate = aggregateChecks(checks);
  return {
    id: `infra-${type}`,
    name,
    type,
    status: aggregate.status,
    healthScore: aggregate.healthScore,
    linkedProjectId: null,
    metrics: [
      { label: "Status", value: aggregate.status.toUpperCase() },
      { label: "Health", value: `${aggregate.healthScore}%` },
      { label: "Checks mit Fehlern", value: `${aggregate.errorCount} von ${aggregate.total}` },
    ],
  };
}

function statusFromFailureRatio(total: number, failed: number): HealthStatus {
  if (total === 0 || failed === 0) return "healthy";
  return failed / total > 0.5 ? "critical" : "warning";
}

function buildCountBasedBuilding(
  type: Extract<CityBuildingType, "ai-center" | "notification-center">,
  name: string,
  total: number,
  failed: number,
  failedLabel: string,
): CityBuilding {
  const status = statusFromFailureRatio(total, failed);
  const healthScore = total === 0 ? 100 : Math.round(((total - failed) / total) * 100);

  const metrics: CityBuildingMetric[] = [
    { label: "Status", value: status.toUpperCase() },
    { label: "Health", value: `${healthScore}%` },
    { label: "Gesamt", value: String(total) },
    { label: failedLabel, value: String(failed) },
  ];

  return { id: `infra-${type}`, name, type, status, healthScore, linkedProjectId: null, metrics };
}

// Reine Transformationsfunktion (keine API-Calls) - nimmt die bereits von
// useCity() geladenen Daten entgegen und erzeugt die Gebaeudeliste fuer die
// City-Komponenten.
export function mapDashboardToCity(
  projects: ProjectHealthSummary[],
  projectDetails: ProjectDashboardDetail[],
  summary: DashboardSummary,
): CityBuilding[] {
  const allChecks = projectDetails.flatMap((detail) => detail.checks);
  const databaseChecks = allChecks.filter((check) => DATABASE_CHECK_TYPES.includes(check.type));
  const apiChecks = allChecks.filter((check) => API_CHECK_TYPES.includes(check.type));

  return [
    ...buildProjectBuildings(projects),
    buildInfrastructureBuilding("database-center", "Database Center", databaseChecks),
    buildInfrastructureBuilding("api-gateway", "API Gateway", apiChecks),
    buildCountBasedBuilding(
      "ai-center",
      "AI Center",
      summary.summary.aiAnalyses.total,
      summary.summary.aiAnalyses.fallback,
      "Fallback-Analysen",
    ),
    buildCountBasedBuilding(
      "notification-center",
      "Notification Center",
      summary.summary.notifications.total,
      summary.summary.notifications.failed,
      "Fehlgeschlagen",
    ),
  ];
}
