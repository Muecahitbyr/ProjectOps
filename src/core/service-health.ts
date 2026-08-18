import { getProjectHealth } from "../db/dashboard.repository";
import { getServiceById } from "../db/services.repository";
import { listDependenciesForService } from "../db/service-dependencies.repository";
import { HealthStatus } from "../types/health.types";
import { MAX_TOPOLOGY_DEPTH } from "../config/topology.config";
import type { Service, ServiceHealth, ServiceHealthStatus } from "../types/service.types";

// Phase 23 Auftragspunkt 8 "Service Health Aggregation" - berechnet Health
// AUSSCHLIESSLICH aus bestehenden Daten (getProjectHealth() -> check_results/
// incidents, Phase 1-7) - keine zweite Health-Engine, kein gespeichertes
// Statusfeld auf services (siehe Migration 0044, Kommentar). HealthStatus
// (Projekt-Momentaufnahme: healthy/warning/critical) wird auf das
// Service-Vokabular abgebildet; WARNING->DEGRADED ist die naechstliegende
// Entsprechung (kein 1:1-Fit, analog zur SLO-Status-Entscheidung in Phase 22).
function mapProjectHealthStatus(status: HealthStatus): ServiceHealthStatus {
  switch (status) {
    case HealthStatus.HEALTHY:
      return "HEALTHY";
    case HealthStatus.WARNING:
      return "DEGRADED";
    case HealthStatus.CRITICAL:
      return "CRITICAL";
  }
}

const STATUS_RANK: Record<ServiceHealthStatus, number> = { UNKNOWN: 0, HEALTHY: 1, DEGRADED: 2, CRITICAL: 3 };

async function computeOwnHealth(service: Service): Promise<{ status: ServiceHealthStatus; openIncidents: number }> {
  if (!service.projectId) {
    // Ein Service ohne project_id ist eine reine Katalog-/Graph-Referenz
    // (z.B. eine externe Abhaengigkeit wie "Stripe") - ProjectOps hat dafuer
    // keine eigenen Messdaten, daher ehrlich UNKNOWN statt eines erfundenen
    // Status.
    return { status: "UNKNOWN", openIncidents: 0 };
  }
  const projectHealth = await getProjectHealth(service.projectId);
  if (!projectHealth) {
    return { status: "UNKNOWN", openIncidents: 0 };
  }
  return { status: mapProjectHealthStatus(projectHealth.health.status), openIncidents: projectHealth.openIncidents };
}

// Rekursiv mit Visited-Set (Zyklus-Sicherheit) und harter Tiefenbegrenzung
// (Auftragspunkt 24 "Performance" - "keine unkontrollierten rekursiven
// Datenbankabfragen", "maximale Tiefe"). Ein CRITICAL-Dependency, die selbst
// unhealthy ist, hebt den Service mindestens auf DEGRADED an (Auftragsbeispiel:
// "Service Rechno, Health DEGRADED, Reason: Stripe dependency degraded") -
// der eigene Health-Status kann diesen Floor weiter auf CRITICAL erhoehen,
// aber niemals darunter senken.
export async function computeServiceHealth(serviceId: number, visited: Set<number> = new Set(), depth = 0): Promise<ServiceHealth> {
  const empty: ServiceHealth = { status: "UNKNOWN", reasons: [], ownHealth: "UNKNOWN", openIncidents: 0, unhealthyDependencies: [] };
  if (visited.has(serviceId) || depth >= MAX_TOPOLOGY_DEPTH) {
    return empty;
  }
  const service = await getServiceById(serviceId);
  if (!service) return empty;

  const nextVisited = new Set(visited);
  nextVisited.add(serviceId);

  const { status: ownHealth, openIncidents } = await computeOwnHealth(service);
  const dependencies = await listDependenciesForService(serviceId);

  const reasons: string[] = [];
  if (ownHealth === "CRITICAL") reasons.push("Own checks are failing");
  else if (ownHealth === "DEGRADED") reasons.push("Own checks show warnings");

  const unhealthyDependencies: ServiceHealth["unhealthyDependencies"] = [];
  // Phase 54 "Production Observability Integrity" - echter, live gefundener
  // Bug: ein Default von "HEALTHY" liess jeden Service OHNE project_id (reine
  // Katalog-/Graph-Referenz, ownHealth bereits korrekt "UNKNOWN", siehe
  // computeOwnHealth oben) faelschlich als "HEALTHY" erscheinen, sobald er
  // keine unhealthy CRITICAL-Dependency hatte - obwohl ProjectOps dafuer gar
  // kein echtes Messsignal besitzt (Beispiel: "rechno - Apple Services", ein
  // bewusst ohne Check angelegter, nicht extern beobachtbarer Knoten, zeigte
  // vor diesem Fix "HEALTHY" statt ehrlich "UNKNOWN" - genau der Fall, den
  // der Kommentar in computeOwnHealth() bereits als Zielverhalten
  // beschreibt). "UNKNOWN" als Default macht den Floor selbst wirkungslos,
  // solange keine echte unhealthy CRITICAL-Dependency existiert (max(ownHealth,
  // UNKNOWN) = ownHealth) - reale, gemessene Zustaende (HEALTHY/DEGRADED/
  // CRITICAL) bleiben dadurch unveraendert, nur der bislang erfundene
  // Healthy-Default faellt weg.
  let floorFromCriticalDeps: ServiceHealthStatus = "UNKNOWN";

  for (const dep of dependencies) {
    const depService = await getServiceById(dep.targetServiceId);
    if (!depService) continue;
    const depHealth = await computeServiceHealth(dep.targetServiceId, nextVisited, depth + 1);
    if (depHealth.status === "DEGRADED" || depHealth.status === "CRITICAL") {
      unhealthyDependencies.push({ serviceId: depService.id, name: depService.name, criticality: dep.criticality, status: depHealth.status });
      if (dep.criticality === "CRITICAL") {
        reasons.push(`${depService.name} dependency is ${depHealth.status.toLowerCase()}`);
        floorFromCriticalDeps = "DEGRADED";
      }
    }
  }

  const finalStatus = STATUS_RANK[ownHealth] >= STATUS_RANK[floorFromCriticalDeps] ? ownHealth : floorFromCriticalDeps;
  return { status: finalStatus, reasons, ownHealth, openIncidents, unhealthyDependencies };
}
