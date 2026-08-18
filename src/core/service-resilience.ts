// Phase 37 "Enterprise Service Resilience & Dependency Intelligence" - reine
// Aggregations-/Kompositionsschicht, siehe types/resilience.types.ts fuer die
// vollstaendige Bestandsanalyse. JEDES Signal stammt aus einer bereits
// bestehenden Engine:
//   - Service-Katalog/Kritikalitaet: db/services.repository.ts (Phase 23)
//   - Health: core/service-health.ts (Phase 23), db/dashboard.repository.ts
//     #getAllProjectsHealth (Phase 4/15) - UNVERAENDERT, keine zweite
//     Health-Berechnung.
//   - Dependency-Graph/Blast Radius/SPOF/Related Signals:
//     core/topology.ts (Phase 25) - fuer den Einzel-Service-Detailblick
//     direkt ueber getFullImpactAnalysis() wiederverwendet (inkl. dessen
//     15s-Cache). Fuer die organisationsweite Uebersicht (viele Projekte auf
//     einmal) waere ein getFullImpactAnalysis()-Aufruf PRO Service ein N+1-
//     Problem (jeder Aufruf traversiert bei Cache-Miss selbst wieder pro
//     Ebene) - buildTopologyGraph() liefert daher den GESAMTEN Graphen der
//     Organisation in genau 2 Abfragen, direkte Dependency-/Dependent-Zahlen
//     und Blast-Radius-Groesse werden anschliessend rein im Speicher (kein
//     weiterer DB-Zugriff) ueber genau dieselbe "source haengt von target ab"-
//     Kantenrichtung wie computeImpact() ermittelt.
//   - Incidents/MTTR/wiederkehrende Muster/SLO-Zusammenfassung je Projekt:
//     core/reliability-intelligence.ts (Phase 33/34), buildReliabilityProjects()
//     unveraendert wiederverwendet.
//   - Probleme: db/problems.repository.ts (Phase 35), listProblems() +
//     getAffectedProjectIdsForProblems() (bereits batched).
//   - Change Risk: core/change-risk.ts#analyzeChangeRisk() (Phase 29) - NUR
//     im Einzel-Service-Detailblick, auf die tatsaechlich diesem Service
//     zugeordneten AKTIVEN Changes begrenzt (kleine, feste Menge), NIE in
//     einer Schleife ueber alle Services der Organisation.
//   - Remediation Effectiveness: core/remediation-effectiveness.ts (Phase 36)
//     - ebenfalls nur im Einzel-Service-Detailblick, begrenzt auf die fuer
//     dieses Projekt offenen Probleme mit verknuepften Changes.
// Kein neuer Health-/Kritikalitaets-Score wird PERSISTIERT - der
// resilienceStatus wird bei jeder Anfrage live aus den obigen, bereits
// bestehenden Signalen abgeleitet (siehe deriveResilienceStatus() unten).
import { getProjectIdsForOrganization, getProjectOrganizationId } from "../db/projects.repository";
import { getAllProjectsHealth } from "../db/dashboard.repository";
import { buildReliabilityProjects } from "./reliability-intelligence";
import type { ProjectReliabilityRow } from "./reliability-intelligence";
import { listServices, getServiceByProjectId, getServicesByIds } from "../db/services.repository";
import { listDependenciesForService, listDependentsForService } from "../db/service-dependencies.repository";
import { buildTopologyGraph, getFullImpactAnalysis } from "./topology";
import type { FullImpactAnalysis } from "./topology";
import { computeServiceBusinessImpact } from "./business-impact";
import { computeServiceHealth } from "./service-health";
import { listSlos, getLatestSloEvaluationsForIds } from "../db/slo.repository";
import { computeErrorBudget } from "./error-budget";
import { listProblems, getAffectedProjectIdsForProblems } from "../db/problems.repository";
import { getProblemEffectiveness } from "./remediation-effectiveness";
import { analyzeChangeRisk } from "./change-risk";
import { listChangesForServiceIds, listServiceIdsForChanges } from "../db/changes.repository";
import { getHealthScoreForecast, getIncidentCountForecast, getResponseTimeForecast } from "../db/forecast.repository";
import { MAX_TOPOLOGY_DEPTH } from "../config/topology.config";
import { HealthStatus } from "../types/health.types";
import type { ForecastResult } from "../types/forecast.types";
import type { Service, ServiceDependency, DependencyType, DependencyCriticality } from "../types/service.types";
import type { SloStatus } from "../types/slo.types";
import type {
  ResilienceOverview,
  ResilienceOverviewRow,
  ResilienceStatus,
  ResilienceSignal,
  ServiceResilienceDetail,
  ServiceDependencyIntelligence,
  ResilienceDependencyEntry,
  ServiceChangeRiskSummary,
  ResilienceForecastSummary,
  ResilienceForecastTrend,
  ServiceResilienceForecast,
  EnrichedImpactedService,
} from "../types/resilience.types";

export interface ResilienceFilter {
  organizationId: string;
  hours: number;
  projectId?: string;
}

// Dieselbe grundlegende "3-Stufen-Rang"-Ordnung wie an mehreren anderen
// Stellen dieser Codebase (SLO-Status, Service-Health) - hier fuer
// resilienceStatus.
// Exportiert fuer Phase 43 (core/operational-priority.ts) - dieselbe
// Rangordnung, keine zweite Definition an anderer Stelle.
export const RESILIENCE_RANK: Record<ResilienceStatus, number> = { UNKNOWN: 0, HEALTHY: 1, DEGRADED: 2, AT_RISK: 3, CRITICAL: 4 };

// Deterministische Schwellenwerte (Auftrag: "keine KI/subjektive Bewertung"),
// jeweils bereits an anderer Stelle dieser Codebase etabliert und hier NUR
// wiederverwendet statt neu erfunden:
//   - RECURRING_INCIDENT_THRESHOLD: identisch zu RECURRING_MIN_COUNT in
//     core/reliability-intelligence.ts (Phase 33).
//   - SPOF_CRITICAL_DEPENDENT_THRESHOLD: identisch zum Default-Threshold von
//     findSpofCandidates() (core/topology.ts, Phase 25).
const RECURRING_INCIDENT_THRESHOLD = 3;
const SPOF_CRITICAL_DEPENDENT_THRESHOLD = 2;
// Eigene, hier dokumentierte Annahme (keine externe Vorgabe, wie bereits bei
// MAX_TOPOLOGY_DEPTH in config/topology.config.ts): ab 5 durch einen
// einzelnen Ausfall betroffenen Services gilt der Blast Radius als "gross"
// genug fuer ein eigenes Signal/einen Statuseinfluss.
const LARGE_BLAST_RADIUS_THRESHOLD = 5;

// Phase 42 "Enterprise Resilience Forecast Intelligence" - Schwellenwerte
// fuer die zwei neuen, rein PROSPEKTIVEN Signale (siehe types/resilience.types.ts
// Kommentar zu PROJECTED_DEGRADATION/PROJECTED_INCIDENT_INCREASE). Beide
// eigene, hier dokumentierte Annahmen (keine externe Vorgabe):
//   - MIN_R_SQUARED_FOR_TREND: unterhalb dieses Bestimmtheitsmasses erklaert
//     die Regressionsgerade zu wenig der tatsaechlichen Streuung, um eine
//     Richtungsaussage zu rechtfertigen - der Trend gilt dann als "STABLE"
//     (nicht "DEGRADING"/"IMPROVING"), auch wenn slopePerDay != 0 ist.
//   - HEALTH_SCORE_PROJECTED_THRESHOLD: ein Trend allein (jede noch so kleine
//     negative Steigung) waere zu empfindlich - das Signal feuert nur, wenn
//     die Regressionsgerade eine Verfuegbarkeit UNTER 80% in den naechsten
//     Tagen vorhersagt (Kombination aus Richtung UND Schwere).
//   - INCIDENT_COUNT_PROJECTED_INCREASE_THRESHOLD: analog fuer Incidents -
//     mindestens 1 zusaetzlicher Incident/Tag am Ende des Prognosefensters
//     gegenueber dem letzten beobachteten Wert.
const MIN_R_SQUARED_FOR_TREND = 0.3;
const HEALTH_SCORE_PROJECTED_THRESHOLD = 80;
const INCIDENT_COUNT_PROJECTED_INCREASE_THRESHOLD = 1;
// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
// RESPONSE_TIME_PROJECTED_INCREASE_FACTOR: anders als HEALTH_SCORE (0..100%,
// ein universeller Massstab) ist eine absolute ms-Schwelle fuer
// Antwortzeiten NICHT sinnvoll uebertragbar (ein 20ms-Healthcheck und ein
// 800ms-Report-Endpunkt sind beide "normal"). Stattdessen ein RELATIVER
// Schwellenwert - dieselbe Groessenordnung (30%), die in diesem Codebase
// bereits als "bedeutsame relative Aenderung" etabliert ist (siehe
// core/remediation-effectiveness.ts#INCIDENT_RATE_THRESHOLD/MTTR_THRESHOLD,
// Phase 36). Erfordert zusaetzlich currentValue>0 (sonst waere jede noch so
// kleine absolute Erhoehung "unendlich" relativ) - dieselbe Vorsichts-Logik
// wie relativeChange() in remediation-effectiveness.ts.
const RESPONSE_TIME_PROJECTED_INCREASE_FACTOR = 0.3;

// Phase 55 "Enterprise Capacity & Resource Optimization" - EXPORTIERT statt
// weiterhin modul-intern, damit core/local-agent.ts dieselbe, bereits
// etablierte Trend-/Schweregrad-Ableitung (Richtung UND Bestimmtheitsmass,
// siehe Kommentar oben) fuer Agent-Kapazitaets-Forecasts (Disk/Memory)
// wiederverwenden kann statt eine zweite, potenziell abweichende Ableitung
// zu erfinden. Reine Sichtbarkeits-Aenderung, KEINE Verhaltensaenderung.
export function classifyForecastTrend(result: ForecastResult, direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"): ResilienceForecastTrend {
  if (!result.sufficientData || result.slopePerDay === null || result.rSquared === null) return "UNKNOWN";
  if (result.rSquared < MIN_R_SQUARED_FOR_TREND || result.slopePerDay === 0) return "STABLE";
  const rising = result.slopePerDay > 0;
  const improving = direction === "HIGHER_IS_BETTER" ? rising : !rising;
  return improving ? "IMPROVING" : "DEGRADING";
}

export function buildForecastSummary(result: ForecastResult, direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"): ResilienceForecastSummary {
  const historical = result.points.filter((p) => !p.predicted);
  const predicted = result.points.filter((p) => p.predicted);
  return {
    sufficientData: result.sufficientData,
    slopePerDay: result.slopePerDay,
    rSquared: result.rSquared,
    currentValue: historical.length > 0 ? historical[historical.length - 1]!.value : null,
    projectedValue: predicted.length > 0 ? predicted[predicted.length - 1]!.value : null,
    forecastDays: predicted.length,
    trend: classifyForecastTrend(result, direction),
  };
}

function mapProjectHealthStatus(status: HealthStatus): "HEALTHY" | "DEGRADED" | "CRITICAL" {
  switch (status) {
    case HealthStatus.HEALTHY:
      return "HEALTHY";
    case HealthStatus.WARNING:
      return "DEGRADED";
    case HealthStatus.CRITICAL:
      return "CRITICAL";
  }
}

// ---------------------------------------------------------------------------
// In-memory Graph-Auswertung fuer die organisationsweite Uebersicht - siehe
// Kommentar am Dateianfang, warum das hier statt ueber getFullImpactAnalysis()
// je Service laeuft.
// ---------------------------------------------------------------------------
interface GraphMetrics {
  dependencyCount: Map<number, number>;
  dependentCount: Map<number, number>;
  criticalDependentCount: Map<number, number>;
  blastRadius: Map<number, number>;
}

function computeGraphMetrics(nodes: Service[], edges: ServiceDependency[]): GraphMetrics {
  const dependencyCount = new Map<number, number>();
  const dependentCount = new Map<number, number>();
  const criticalDependentCount = new Map<number, number>();
  // "wer haengt von mir ab" = eingehende Kanten in umgekehrter Richtung
  // (source->target = "source haengt von target ab"), exakt dieselbe
  // Semantik wie computeImpact() in core/topology.ts.
  const reverseAdjacency = new Map<number, number[]>();

  for (const node of nodes) {
    dependencyCount.set(node.id, 0);
    dependentCount.set(node.id, 0);
    criticalDependentCount.set(node.id, 0);
    reverseAdjacency.set(node.id, []);
  }
  for (const edge of edges) {
    dependencyCount.set(edge.sourceServiceId, (dependencyCount.get(edge.sourceServiceId) ?? 0) + 1);
    dependentCount.set(edge.targetServiceId, (dependentCount.get(edge.targetServiceId) ?? 0) + 1);
    if (edge.criticality === "CRITICAL") {
      criticalDependentCount.set(edge.targetServiceId, (criticalDependentCount.get(edge.targetServiceId) ?? 0) + 1);
    }
    const list = reverseAdjacency.get(edge.targetServiceId) ?? [];
    list.push(edge.sourceServiceId);
    reverseAdjacency.set(edge.targetServiceId, list);
  }

  const blastRadius = new Map<number, number>();
  for (const node of nodes) {
    const visited = new Set<number>([node.id]);
    let frontier = reverseAdjacency.get(node.id) ?? [];
    for (let depth = 1; depth <= MAX_TOPOLOGY_DEPTH && frontier.length > 0; depth++) {
      const next: number[] = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);
        next.push(...(reverseAdjacency.get(id) ?? []));
      }
      frontier = next;
    }
    visited.delete(node.id);
    blastRadius.set(node.id, visited.size);
  }

  return { dependencyCount, dependentCount, criticalDependentCount, blastRadius };
}

// ---------------------------------------------------------------------------
// Eigene, kleine SLO-Zusammenfassung je Projekt (bewusst NICHT die private
// getSloSummaryByProject() aus core/reliability-intelligence.ts wiederverwendet,
// um Phase 34 nicht anfassen zu muessen - dieselben drei bereits exportierten
// Bausteine (listSlos/getLatestSloEvaluationsForIds/computeErrorBudget,
// Phase 22/34), hier zusaetzlich um criticalSLOCount erweitert, das die
// Resilience-Uebersicht explizit braucht).
// ---------------------------------------------------------------------------
interface ProjectSloSummary {
  sloCount: number;
  criticalSLOCount: number;
  worstSloStatus: SloStatus | null;
  avgErrorBudgetRemainingPercent: number | null;
}

const SLO_STATUS_SEVERITY: Record<SloStatus, number> = { HEALTHY: 0, DEGRADED: 1, CRITICAL: 2 };

async function getSloSummaryByProject(projectIds: string[]): Promise<Map<string, ProjectSloSummary>> {
  if (projectIds.length === 0) return new Map();
  const slos = await listSlos({ projectIds, enabled: true });
  const scopedSlos = slos.filter((slo) => slo.projectId !== null);
  const evaluations = await getLatestSloEvaluationsForIds(scopedSlos.map((s) => s.id));

  const byProject = new Map<string, { count: number; critical: number; worst: SloStatus | null; remainingSum: number; remainingCount: number }>();
  for (const slo of scopedSlos) {
    const projectId = slo.projectId as string;
    const entry = byProject.get(projectId) ?? { count: 0, critical: 0, worst: null, remainingSum: 0, remainingCount: 0 };
    entry.count += 1;
    const evaluation = evaluations.get(slo.id);
    if (evaluation) {
      const errorBudget = computeErrorBudget(slo.sliType, slo.target, evaluation.sliValue, slo.windowDays);
      if (errorBudget.status === "CRITICAL") entry.critical += 1;
      if (entry.worst === null || SLO_STATUS_SEVERITY[errorBudget.status] > SLO_STATUS_SEVERITY[entry.worst]) {
        entry.worst = errorBudget.status;
      }
      entry.remainingSum += errorBudget.remainingPercentOfBudget;
      entry.remainingCount += 1;
    }
    byProject.set(projectId, entry);
  }

  const result = new Map<string, ProjectSloSummary>();
  for (const [projectId, entry] of byProject) {
    result.set(projectId, {
      sloCount: entry.count,
      criticalSLOCount: entry.critical,
      worstSloStatus: entry.worst,
      avgErrorBudgetRemainingPercent: entry.remainingCount > 0 ? Number((entry.remainingSum / entry.remainingCount).toFixed(2)) : null,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Offene Probleme je Projekt - "offen" identisch zur bereits an mehreren
// Stellen (db/problems.repository.ts#getCheckIdsWithOpenProblem) etablierten
// Definition "status NOT IN (RESOLVED, CLOSED)". Batched ueber
// getAffectedProjectIdsForProblems() (Phase 35), keine Abfrage pro Projekt.
// ---------------------------------------------------------------------------
interface ProjectProblemSummary {
  openCount: number;
  openCriticalCount: number;
  items: { id: number; title: string; status: string; priority: string }[];
}

async function getOpenProblemsByProject(organizationId: string): Promise<Map<string, ProjectProblemSummary>> {
  const allProblems = await listProblems({ organizationId });
  const openProblems = allProblems.filter((p) => p.status !== "RESOLVED" && p.status !== "CLOSED");
  if (openProblems.length === 0) return new Map();
  const projectIdsByProblem = await getAffectedProjectIdsForProblems(openProblems.map((p) => p.id));

  const byProject = new Map<string, ProjectProblemSummary>();
  for (const problem of openProblems) {
    const projectIds = projectIdsByProblem.get(problem.id) ?? [];
    for (const projectId of projectIds) {
      const entry = byProject.get(projectId) ?? { openCount: 0, openCriticalCount: 0, items: [] };
      entry.openCount += 1;
      if (problem.priority === "CRITICAL") entry.openCriticalCount += 1;
      entry.items.push({ id: problem.id, title: problem.title, status: problem.status, priority: problem.priority });
      byProject.set(projectId, entry);
    }
  }
  return byProject;
}

// ---------------------------------------------------------------------------
// resilienceStatus - deterministische Ableitung, schwerwiegendstes Signal
// gewinnt. Reihenfolge/Schwellenwerte siehe Kommentare oben; UNKNOWN ist
// bewusst der Startwert und wird NUR verlassen, wenn tatsaechlich
// Messdaten vorliegen (mind. ein Check konfiguriert - checksTotal>0).
// ---------------------------------------------------------------------------
function deriveResilienceStatus(input: {
  hasChecks: boolean;
  healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  worstSloStatus: SloStatus | null;
  openCriticalProblems: number;
  openProblems: number;
  isPotentialSpof: boolean;
  blastRadius: number;
  recurringIncidentCount: number;
  highCriticalCount: number;
  // Phase 56 "Enterprise Service Continuity & Resilience Assurance" - der
  // schlechteste healthStatus unter den CRITICAL-Dependencies dieses Service
  // (null = keine Dependency ist unhealthy). Bisher betrachtete diese
  // Funktion AUSSCHLIESSLICH den eigenen Zustand + den AUSWAERTIGEN Impact
  // (Blast Radius/SPOF, "wen betreffe ich") - nie den EINWAERTIGEN
  // Kontinuitaets-Risiko-Fall "eine kritische Abhaengigkeit faellt aus,
  // obwohl dieser Service selbst gerade gesund ist".
  criticalDependencyStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | null;
}): ResilienceStatus {
  if (!input.hasChecks && input.healthStatus === "UNKNOWN") return "UNKNOWN";

  const isCritical =
    input.healthStatus === "CRITICAL" ||
    input.worstSloStatus === "CRITICAL" ||
    input.openCriticalProblems > 0 ||
    input.highCriticalCount > 0 ||
    input.criticalDependencyStatus === "CRITICAL";
  if (isCritical) return "CRITICAL";

  const isAtRisk =
    (input.isPotentialSpof && (input.healthStatus === "DEGRADED" || input.worstSloStatus === "DEGRADED" || input.openProblems > 0)) ||
    input.worstSloStatus === "DEGRADED" ||
    input.recurringIncidentCount >= RECURRING_INCIDENT_THRESHOLD ||
    (input.isPotentialSpof && input.blastRadius >= LARGE_BLAST_RADIUS_THRESHOLD) ||
    input.criticalDependencyStatus === "DEGRADED";
  if (isAtRisk) return "AT_RISK";

  if (input.healthStatus === "DEGRADED" || input.openProblems > 0) return "DEGRADED";

  return "HEALTHY";
}

// ---------------------------------------------------------------------------
// Auftragspunkt "Resilience Overview" - GET /api/resilience/overview
//
// Phase 41 "Resilience Layer Performance & Consistency Hardening" - vorher
// KEIN Cache, obwohl buildResilienceOverview() inzwischen von VIER Stellen
// aufgerufen wird: interne UI-Route (37), v1-API (39) und - am
// schwerwiegendsten - core/resilience-alerting.ts (38), das JEDE
// Organisation alle 5 Minuten einmal voll neu berechnet. Exakt dasselbe
// Map+TTL-Muster wie core/topology.ts#getFullImpactAnalysis() (15s TTL,
// {fresh}-Override) - kein neues Cache-Utility, keine neue Technik.
//
// Bewusst OHNE aktive Invalidierung bei Mutationen (anders als Topology's
// invalidateImpactAnalysisCache()): Resilience aggregiert bereits ueber
// SECHS verschiedene Quellen (Health/Reliability/SLO/Probleme/Topologie/
// Change-Risiko) - aktive Invalidierung haette Mutations-Hooks an ebenso
// vielen, ueber das gesamte System verstreuten Schreib-Routen erfordert
// (echtes Risiko, eine davon zu vergessen - dieselbe Bugklasse wie die
// mehrfach dokumentierten CHECK-Constraint-Syncs). Eine reine 15s-TTL ist
// hier ausreichend: der resilienceStatus selbst basiert ohnehin auf einem
// mindestens 24h-Fenster (SLO-Auswertung alle 2min, Reliability-Fenster in
// Stunden) - 15s zusaetzliche Verzoegerung aendert die wahrgenommene
// Aktualitaet nicht spuerbar.
//
// projectId-Filterung erfolgt NACH dem Cache-Zugriff (in-memory), nicht
// mehr als Teil der zugrunde liegenden Abfragen - der volle Organisations-
// Datensatz wird einmal berechnet/gecacht und fuer JEDEN projectId-Filter
// derselben Organisation wiederverwendet, statt pro Filterwert erneut alle
// sechs Quellen abzufragen.
// ---------------------------------------------------------------------------
const RESILIENCE_OVERVIEW_CACHE_TTL_MS = 15_000;
interface CachedResilienceOverview {
  computedAt: number;
  overview: ResilienceOverview;
}
const resilienceOverviewCache = new Map<string, CachedResilienceOverview>();

function summarizeResilienceRows(rows: ResilienceOverviewRow[]): ResilienceOverview["summary"] {
  const summary = { critical: 0, atRisk: 0, degraded: 0, healthy: 0, unknown: 0, potentialSpofCount: 0 };
  for (const row of rows) {
    if (row.resilienceStatus === "CRITICAL") summary.critical += 1;
    else if (row.resilienceStatus === "AT_RISK") summary.atRisk += 1;
    else if (row.resilienceStatus === "DEGRADED") summary.degraded += 1;
    else if (row.resilienceStatus === "HEALTHY") summary.healthy += 1;
    else summary.unknown += 1;
    if (row.isPotentialSpof) summary.potentialSpofCount += 1;
  }
  return summary;
}

export async function buildResilienceOverview(filter: ResilienceFilter, options: { fresh?: boolean } = {}): Promise<ResilienceOverview> {
  const cacheKey = `${filter.organizationId}:${filter.hours}`;
  const cached = resilienceOverviewCache.get(cacheKey);
  let full: ResilienceOverview;
  if (!options.fresh && cached && Date.now() - cached.computedAt < RESILIENCE_OVERVIEW_CACHE_TTL_MS) {
    full = cached.overview;
  } else {
    full = await computeFullResilienceOverview(filter.organizationId, filter.hours);
    resilienceOverviewCache.set(cacheKey, { computedAt: Date.now(), overview: full });
  }

  if (!filter.projectId) return full;

  // Tenant-sicher: filtert ausschliesslich innerhalb des bereits fuer DIESE
  // Organisation berechneten Ergebnisses - ein projectId, das nicht zur
  // Organisation gehoert, ergibt automatisch eine leere Zeilenliste (dieselbe
  // Semantik wie zuvor), da full.rows von vornherein tenant-gescoped ist.
  const rows = full.rows.filter((row) => row.projectId === filter.projectId);
  return { ...full, projectCount: rows.length, summary: summarizeResilienceRows(rows), rows };
}

async function computeFullResilienceOverview(organizationId: string, hours: number): Promise<ResilienceOverview> {
  const projectIds = await getProjectIdsForOrganization(organizationId);

  const [reliabilityRows, healthList, services, topologyGraph, sloSummaries, openProblems] = await Promise.all([
    buildReliabilityProjects({ organizationId, hours }),
    getAllProjectsHealth(organizationId),
    listServices({ organizationId }),
    buildTopologyGraph(organizationId),
    getSloSummaryByProject(projectIds),
    getOpenProblemsByProject(organizationId),
  ]);

  const healthByProject = new Map(healthList.map((p) => [p.id, p]));
  const reliabilityByProject = new Map(reliabilityRows.map((r) => [r.projectId, r]));
  const serviceByProject = new Map<string, Service>();
  for (const s of services) {
    if (s.projectId) serviceByProject.set(s.projectId, s);
  }
  const graphMetrics = computeGraphMetrics(topologyGraph.nodes, topologyGraph.edges);

  // Phase 56 "Enterprise Service Continuity & Resilience Assurance" - dieselbe
  // "billige Vorsortierung aus bereits geladenen Daten"-Philosophie wie
  // graphMetrics oben (Auftragspunkt 7 "Performance", Phase 43): eine
  // Approximation aus bereits geladenen topologyGraph.edges/services/
  // healthByProject (0 zusaetzliche Abfragen), NICHT computeServiceHealth()
  // pro Dependency (das waere ein N+1 ueber die gesamte Organisation). Die
  // DETAIL-Ebene (buildServiceResilienceDetail() unten) bleibt die
  // praezisere, service-eigene Berechnung fuer EIN Projekt - dieselbe
  // Zweistufigkeit (billige Uebersicht/teures Detail) wie ueberall sonst in
  // diesem System.
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const criticalDependencyTargetsBySource = new Map<number, number[]>();
  for (const edge of topologyGraph.edges) {
    if (edge.criticality !== "CRITICAL") continue;
    const list = criticalDependencyTargetsBySource.get(edge.sourceServiceId) ?? [];
    list.push(edge.targetServiceId);
    criticalDependencyTargetsBySource.set(edge.sourceServiceId, list);
  }
  function overviewCriticalDependencyStatus(serviceId: number | undefined): "HEALTHY" | "DEGRADED" | "CRITICAL" | null {
    if (serviceId === undefined) return null;
    const targets = criticalDependencyTargetsBySource.get(serviceId) ?? [];
    let worst: "HEALTHY" | "DEGRADED" | "CRITICAL" | null = null;
    for (const targetId of targets) {
      const targetProjectId = serviceById.get(targetId)?.projectId;
      const targetHealth = targetProjectId ? healthByProject.get(targetProjectId) : undefined;
      if (!targetHealth || targetHealth.checks.total === 0) continue;
      const status = mapProjectHealthStatus(targetHealth.health.status);
      if (status === "HEALTHY") continue;
      if (status === "CRITICAL") return "CRITICAL";
      worst = "DEGRADED";
    }
    return worst;
  }

  const rows: ResilienceOverviewRow[] = [];
  for (const projectId of projectIds) {
    const health = healthByProject.get(projectId);
    if (!health) continue;
    const reliability: ProjectReliabilityRow | undefined = reliabilityByProject.get(projectId);
    const service = serviceByProject.get(projectId);
    const sloSummary = sloSummaries.get(projectId);
    const problemSummary = openProblems.get(projectId);

    const hasChecks = health.checks.total > 0;
    const healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN" = hasChecks ? mapProjectHealthStatus(health.health.status) : "UNKNOWN";

    const dependencyCount = service ? graphMetrics.dependencyCount.get(service.id) ?? 0 : 0;
    const dependentCount = service ? graphMetrics.dependentCount.get(service.id) ?? 0 : 0;
    const blastRadius = service ? graphMetrics.blastRadius.get(service.id) ?? 0 : 0;
    const criticalDependentCount = service ? graphMetrics.criticalDependentCount.get(service.id) ?? 0 : 0;
    const isPotentialSpof = criticalDependentCount >= SPOF_CRITICAL_DEPENDENT_THRESHOLD;

    const recurringIncidentCount = reliability?.repeatIncidentCount ?? 0;
    const highCriticalCount = reliability?.criticalIncidentCount ?? 0;

    const resilienceStatus = deriveResilienceStatus({
      hasChecks,
      healthStatus,
      worstSloStatus: sloSummary?.worstSloStatus ?? null,
      openCriticalProblems: problemSummary?.openCriticalCount ?? 0,
      openProblems: problemSummary?.openCount ?? 0,
      isPotentialSpof,
      blastRadius,
      criticalDependencyStatus: overviewCriticalDependencyStatus(service?.id),
      recurringIncidentCount,
      highCriticalCount,
    });

    rows.push({
      projectId,
      projectName: health.name,
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? null,
      serviceCriticality: service?.criticality ?? null,
      healthScore: health.health.score,
      healthStatus,
      incidentCount: reliability?.incidentCount ?? 0,
      highCriticalCount,
      openIncidentCount: health.openIncidents,
      mttrMs: reliability?.mttrMs ?? null,
      recurringIncidentCount,
      openProblems: problemSummary?.openCount ?? 0,
      openCriticalProblems: problemSummary?.openCriticalCount ?? 0,
      sloCount: sloSummary?.sloCount ?? 0,
      criticalSLOCount: sloSummary?.criticalSLOCount ?? 0,
      worstSloStatus: sloSummary?.worstSloStatus ?? null,
      errorBudgetRisk: sloSummary?.worstSloStatus === "CRITICAL" || sloSummary?.worstSloStatus === "DEGRADED",
      dependencyCount,
      dependentCount,
      blastRadius,
      isPotentialSpof,
      resilienceStatus,
    });
  }

  rows.sort((a, b) => RESILIENCE_RANK[b.resilienceStatus] - RESILIENCE_RANK[a.resilienceStatus] || b.incidentCount - a.incidentCount);

  return { windowHours: hours, organizationId, projectCount: rows.length, summary: summarizeResilienceRows(rows), rows };
}

// ---------------------------------------------------------------------------
// Gemeinsamer Kontext fuer die drei Einzel-Service-Endpunkte (Detail/
// Dependencies/Signals) - EIN Durchlauf statt dreifach dieselbe Logik, siehe
// routes/resilience.routes.ts.
// ---------------------------------------------------------------------------
export async function buildServiceResilienceDetail(projectId: string, hours: number): Promise<ServiceResilienceDetail | undefined> {
  const organizationId = await getProjectOrganizationId(projectId);
  if (!organizationId) return undefined;

  const service = await getServiceByProjectId(projectId);

  // Phase 42 "Enterprise Resilience Forecast Intelligence" - db/forecast.
  // repository.ts (Phase 13) unveraendert wiederverwendet, keine zweite
  // Prognose-/Regressions-Engine. Beide Funktionen sind bereits auf EIN
  // Projekt begrenzt (kein Organisations-weiter Aufruf, siehe Kommentar am
  // Dateikopf, warum das bewusst nur im Detailblick passiert), daher hier im
  // selben Promise.all wie die uebrigen Projekt-gebundenen Abfragen.
  const [healthList, reliabilityRows, sloSummaries, openProblemsByProject, healthForecastResult, incidentForecastResult, responseTimeForecastResult] = await Promise.all([
    getAllProjectsHealth(organizationId),
    buildReliabilityProjects({ organizationId, hours, projectId }),
    getSloSummaryByProject([projectId]),
    getOpenProblemsByProject(organizationId),
    getHealthScoreForecast(projectId),
    getIncidentCountForecast(projectId),
    // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
    // getResponseTimeForecast() existiert bereits seit Phase 13, war bislang
    // nur ueber die generische /api/forecasts/:metric-Route erreichbar.
    getResponseTimeForecast(projectId),
  ]);

  const health = healthList.find((p) => p.id === projectId);
  if (!health) return undefined;
  const reliability = reliabilityRows[0];
  const sloSummary = sloSummaries.get(projectId);
  const problemSummary = openProblemsByProject.get(projectId);
  const forecast: ServiceResilienceForecast = {
    healthScore: buildForecastSummary(healthForecastResult, "HIGHER_IS_BETTER"),
    incidentCount: buildForecastSummary(incidentForecastResult, "LOWER_IS_BETTER"),
    responseTimeMs: buildForecastSummary(responseTimeForecastResult, "LOWER_IS_BETTER"),
  };
  const hasChecks = (health?.checks.total ?? 0) > 0;
  const healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN" = hasChecks && health ? mapProjectHealthStatus(health.health.status) : "UNKNOWN";

  let dependencies: ServiceDependencyIntelligence | null = null;
  let blastRadius: ServiceResilienceDetail["blastRadius"] = null;
  let isPotentialSpof = false;
  let activeChangeRisks: ServiceChangeRiskSummary[] = [];
  let serviceHealthReasons: string[] = [];
  let serviceOwnHealthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN" = healthStatus;
  // Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
  // dasselbe impactAnalysis-Objekt, das unten fuer blastRadius/isPotentialSpof
  // sowieso schon geladen wird, wird spaeter (nach signals) NOCHMAL fuer
  // computeServiceBusinessImpact() verwendet - 0 zusaetzliche Queries.
  let impactAnalysisForBusinessImpact: FullImpactAnalysis | null = null;
  // Phase 57 "Enterprise Operational Dependency & Blast Radius Assurance" -
  // nur berechnet, wenn der Blast Radius ohnehin schon gross genug fuer das
  // LARGE_BLAST_RADIUS-Signal ist (dieselbe Schwelle) - haelt die Kosten
  // proportional (kein enrichAffectedServicesWithStatus()-Aufruf fuer die
  // ueberwiegende Mehrheit kleiner/keiner Blast-Radien).
  let unhealthyAffectedServiceCount: number | null = null;

  if (service) {
    const [ownHealth, impactAnalysis] = await Promise.all([computeServiceHealth(service.id), getFullImpactAnalysis(service)]);
    impactAnalysisForBusinessImpact = impactAnalysis;
    serviceHealthReasons = ownHealth.reasons;
    serviceOwnHealthStatus = ownHealth.status;

    const spofCandidates = impactAnalysis.spofCandidates;
    isPotentialSpof = spofCandidates.some((c) => c.serviceId === service.id);

    blastRadius = {
      affectedServiceCount: impactAnalysis.affectedServices.length,
      maxDepthReached: impactAnalysis.maxDepth,
      truncated: impactAnalysis.truncated,
      hasCriticalPath: impactAnalysis.criticalPaths.length > 0,
      spofCount: spofCandidates.length,
    };

    if (impactAnalysis.affectedServices.length >= LARGE_BLAST_RADIUS_THRESHOLD) {
      const enrichedAffected = await enrichAffectedServicesWithStatus(impactAnalysis.affectedServices);
      unhealthyAffectedServiceCount = enrichedAffected.filter((s) => s.healthStatus === "CRITICAL" || s.healthStatus === "DEGRADED").length;
    }

    dependencies = await buildServiceDependencyIntelligence(service);

    // Change Risk (Phase 29) - NUR fuer die aktiven/geplanten Changes dieses
    // EINEN Service, keine Schleife ueber weitere Services/Dependencies.
    const activeChanges = await listChangesForServiceIds([service.id], ["SCHEDULED", "IN_PROGRESS"]);
    if (activeChanges.length > 0) {
      const serviceIdsByChange = await listServiceIdsForChanges(activeChanges.map((c) => c.id));
      const risks = await Promise.all(
        activeChanges.map((change) => analyzeChangeRisk({ ...change, serviceIds: serviceIdsByChange.get(change.id) ?? [service.id] })),
      );
      activeChangeRisks = risks.map((r, i) => ({
        changeId: r.changeId,
        title: activeChanges[i]!.title,
        status: activeChanges[i]!.status,
        score: r.score,
        verdict: r.verdict,
      }));
    }
  }

  // Remediation Effectiveness (Phase 36) - begrenzt auf die fuer DIESES
  // Projekt offenen Probleme (typischerweise wenige), keine Organisationsweite
  // Schleife.
  const remediationEffectiveness: ServiceResilienceDetail["remediationEffectiveness"] = [];
  if (problemSummary) {
    const effectivenessResults = await Promise.all(problemSummary.items.map((p) => getProblemEffectiveness(p.id)));
    for (const result of effectivenessResults) {
      if (!result) continue;
      for (const change of result.changes) {
        remediationEffectiveness.push({ problemId: result.problemId, changeId: change.changeId, changeTitle: change.changeTitle, status: change.status });
      }
    }
  }

  // Phase 56 "Enterprise Service Continuity & Resilience Assurance" - nutzt
  // dependencies.dependencies (Phase 25/37, bereits oben geladen, keine
  // zweite Abfrage) um den EINWAERTIGEN Kontinuitaets-Fall zu erkennen:
  // haengt dieser Service kritisch von einem gerade unhealthy Service ab.
  const criticalUnhealthyDependencies = (dependencies?.dependencies ?? []).filter(
    (d) => d.criticality === "CRITICAL" && (d.healthStatus === "DEGRADED" || d.healthStatus === "CRITICAL"),
  );
  const criticalDependencyStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | null =
    criticalUnhealthyDependencies.length === 0
      ? null
      : criticalUnhealthyDependencies.some((d) => d.healthStatus === "CRITICAL")
        ? "CRITICAL"
        : "DEGRADED";

  const resilienceStatus = deriveResilienceStatus({
    hasChecks,
    healthStatus: service ? (healthRankFor(serviceOwnHealthStatus) >= healthRankFor(healthStatus) ? serviceOwnHealthStatus : healthStatus) : healthStatus,
    worstSloStatus: sloSummary?.worstSloStatus ?? null,
    openCriticalProblems: problemSummary?.openCriticalCount ?? 0,
    openProblems: problemSummary?.openCount ?? 0,
    isPotentialSpof,
    blastRadius: blastRadius?.affectedServiceCount ?? 0,
    recurringIncidentCount: reliability?.repeatIncidentCount ?? 0,
    highCriticalCount: reliability?.criticalIncidentCount ?? 0,
    criticalDependencyStatus,
  });

  const signals = buildResilienceSignalsFromDetail({
    project: { id: projectId, name: health.name },
    criticalUnhealthyDependencies,
    service,
    healthStatus,
    reasons: serviceHealthReasons,
    sloSummary,
    problemSummary,
    isPotentialSpof,
    blastRadius,
    unhealthyAffectedServiceCount,
    activeChangeRisks,
    remediationEffectiveness,
    recurringIncidentCount: reliability?.repeatIncidentCount ?? 0,
    forecast,
  });

  const businessImpact = computeServiceBusinessImpact({ service, impactAnalysis: impactAnalysisForBusinessImpact, signals });

  return {
    projectId,
    projectName: health.name,
    serviceId: service?.id ?? null,
    serviceName: service?.name ?? null,
    serviceCriticality: service?.criticality ?? null,
    resilienceStatus,
    health: { status: healthStatus, reasons: serviceHealthReasons, openIncidents: health?.openIncidents ?? 0 },
    reliability: {
      incidentCount: reliability?.incidentCount ?? 0,
      highCriticalCount: reliability?.criticalIncidentCount ?? 0,
      mttrMs: reliability?.mttrMs ?? null,
      recurringIncidentCount: reliability?.repeatIncidentCount ?? 0,
    },
    slo: {
      sloCount: sloSummary?.sloCount ?? 0,
      worstSloStatus: sloSummary?.worstSloStatus ?? null,
      avgErrorBudgetRemainingPercent: sloSummary?.avgErrorBudgetRemainingPercent ?? null,
    },
    problems: { openCount: problemSummary?.openCount ?? 0, openCriticalCount: problemSummary?.openCriticalCount ?? 0, items: problemSummary?.items ?? [] },
    dependencies,
    blastRadius,
    isPotentialSpof,
    activeChangeRisks,
    remediationEffectiveness,
    forecast,
    signals,
    businessImpact,
  };
}

// Kleine lokale Rangfunktion nur fuer den Vergleich "eigener Service-Health-
// Status" vs. "Projekt-Health-Status" oben (derselbe Floor-Gedanke wie
// core/service-health.ts: der schlechtere der beiden gewinnt).
function healthRankFor(status: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN"): number {
  return { UNKNOWN: 0, HEALTHY: 1, DEGRADED: 2, CRITICAL: 3 }[status];
}

// Auftragspunkt "Dependency Intelligence" - direkte Dependencies UND
// Dependents dieses EINEN Service, jeweils angereichert mit Health/SLO/
// Incidents. "Batched, nicht pro Dependency" (Auftrag) bezieht sich auf die
// SLO-Zusammenfassung (EINE Batch-Abfrage ueber alle betroffenen Projekte,
// getSloSummaryByProject() oben) - fuer computeServiceHealth() gibt es
// dagegen KEINE Batch-Variante; ein Promise.all() ueber die (typischerweise
// wenigen) direkten Nachbarn EINES Service ist dasselbe, bereits an anderer
// Stelle etablierte Muster wie GET /platform/services (routes/platform-
// services.routes.ts), das computeServiceHealth() ebenfalls pro Service in
// der Liste aufruft.
async function buildServiceDependencyIntelligence(service: Service): Promise<ServiceDependencyIntelligence> {
  const [deps, dependents] = await Promise.all([listDependenciesForService(service.id), listDependentsForService(service.id)]);
  const relatedServiceIds = [...new Set([...deps.map((d) => d.targetServiceId), ...dependents.map((d) => d.sourceServiceId)])];
  if (relatedServiceIds.length === 0) {
    return { serviceId: service.id, serviceName: service.name, dependencies: [], dependents: [] };
  }

  const relatedServices = await getServicesByIds(relatedServiceIds);
  const relatedById = new Map(relatedServices.map((s) => [s.id, s]));
  const relatedProjectIds = [...new Set(relatedServices.map((s) => s.projectId).filter((p): p is string => p !== null))];

  const [healthResults, sloSummaries] = await Promise.all([
    Promise.all(relatedServices.map((s) => computeServiceHealth(s.id))),
    getSloSummaryByProject(relatedProjectIds),
  ]);
  const healthByService = new Map(relatedServices.map((s, i) => [s.id, healthResults[i]!]));

  function toEntry(relatedServiceId: number, dependencyType: DependencyType, criticality: DependencyCriticality): ResilienceDependencyEntry | null {
    const relatedService = relatedById.get(relatedServiceId);
    if (!relatedService) return null;
    const health = healthByService.get(relatedServiceId);
    const sloSummary = relatedService.projectId ? sloSummaries.get(relatedService.projectId) : undefined;
    return {
      serviceId: relatedService.id,
      serviceName: relatedService.name,
      projectId: relatedService.projectId,
      dependencyType,
      criticality,
      healthStatus: health?.status ?? "UNKNOWN",
      openIncidents: health?.openIncidents ?? 0,
      worstSloStatus: sloSummary?.worstSloStatus ?? null,
    };
  }

  const dependencies = deps
    .map((d) => toEntry(d.targetServiceId, d.dependencyType, d.criticality))
    .filter((e): e is ResilienceDependencyEntry => e !== null);
  const dependentsList = dependents
    .map((d) => toEntry(d.sourceServiceId, d.dependencyType, d.criticality))
    .filter((e): e is ResilienceDependencyEntry => e !== null);

  return { serviceId: service.id, serviceName: service.name, dependencies, dependents: dependentsList };
}

// Phase 57 "Enterprise Operational Dependency & Blast Radius Assurance" -
// Bestandsanalyse-Ergebnis: core/topology.ts#getFullImpactAnalysis() (Phase
// 25) berechnet den vollen, mehrstufigen Blast Radius bereits korrekt
// (bereits bei /platform/services/:id/impact UND /changes/:id/impact
// wiederverwendet) - liefert aber NUR Service-Stammdaten + Tiefe, KEINE
// Health-/SLO-Information ueber die betroffenen Services. Diese Funktion
// ergaenzt AUSSCHLIESSLICH die fehlende Anreicherung, mit demselben Muster
// wie buildServiceDependencyIntelligence() oben (batched computeServiceHealth
// + EINE batched getSloSummaryByProject()-Abfrage, kein N+1) - reine
// Kompositionsschicht, keine zweite Blast-Radius-Berechnung.
export async function enrichAffectedServicesWithStatus(
  affectedServices: (Service & { depth: number | null })[],
): Promise<EnrichedImpactedService[]> {
  if (affectedServices.length === 0) return [];

  const projectIds = [...new Set(affectedServices.map((s) => s.projectId).filter((p): p is string => p !== null))];
  const [healthResults, sloSummaries] = await Promise.all([
    Promise.all(affectedServices.map((s) => computeServiceHealth(s.id))),
    getSloSummaryByProject(projectIds),
  ]);

  return affectedServices.map((service, i) => {
    const health = healthResults[i]!;
    const sloSummary = service.projectId ? sloSummaries.get(service.projectId) : undefined;
    return {
      serviceId: service.id,
      serviceName: service.name,
      projectId: service.projectId,
      depth: service.depth,
      healthStatus: health.status,
      openIncidents: health.openIncidents,
      worstSloStatus: sloSummary?.worstSloStatus ?? null,
    };
  });
}

function buildResilienceSignalsFromDetail(input: {
  project: { id: string; name: string };
  service: Service | undefined;
  healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  reasons: string[];
  sloSummary: ProjectSloSummary | undefined;
  problemSummary: ProjectProblemSummary | undefined;
  isPotentialSpof: boolean;
  blastRadius: ServiceResilienceDetail["blastRadius"];
  // Phase 57 "Enterprise Operational Dependency & Blast Radius Assurance" -
  // null = nicht berechnet (Blast Radius unter der Schwelle, siehe
  // Aufrufstelle), sonst die Anzahl bereits AKTUELL unhealthy betroffener
  // Services (empirische Ergaenzung zur rein strukturellen Zahl oben).
  unhealthyAffectedServiceCount: number | null;
  activeChangeRisks: ServiceChangeRiskSummary[];
  remediationEffectiveness: ServiceResilienceDetail["remediationEffectiveness"];
  recurringIncidentCount: number;
  forecast: ServiceResilienceForecast;
  // Phase 56 "Enterprise Service Continuity & Resilience Assurance".
  criticalUnhealthyDependencies: ResilienceDependencyEntry[];
}): ResilienceSignal[] {
  const signals: ResilienceSignal[] = [];
  const entity = { kind: "PROJECT" as const, id: input.project.id, name: input.project.name };

  // Phase 56 "Enterprise Service Continuity & Resilience Assurance" - der
  // Signaltyp CRITICAL_DEPENDENCY_UNHEALTHY war bereits in
  // types/resilience.types.ts UND in core/operational-priority.ts's
  // RECOMMENDED_ACTION_BY_SIGNAL-Lookup vorgesehen (Phase 43), wurde aber
  // nie tatsaechlich erzeugt (live via Bestandsanalyse gefunden - toter
  // Signaltyp). Ein Eintrag pro betroffener kritischer Dependency (ueblich
  // wenige), keine gesonderte Deckelung noetig - der bestehende
  // `.slice(0, 10)`-Gesamtschnitt am Funktionsende faengt den seltenen
  // Extremfall ab.
  for (const dep of input.criticalUnhealthyDependencies) {
    signals.push({
      type: "CRITICAL_DEPENDENCY_UNHEALTHY",
      severity: dep.healthStatus === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: "Critical Dependency Unhealthy",
      explanation: `This service critically depends on "${dep.serviceName}", which is currently ${dep.healthStatus}. Even though this service may appear fine on its own, its continuity is at risk.`,
      affectedEntity: { kind: "SERVICE", id: dep.serviceId, name: dep.serviceName },
    });
  }

  if (input.isPotentialSpof && input.service) {
    signals.push({
      type: "POTENTIAL_SINGLE_POINT_OF_FAILURE",
      severity: "CRITICAL",
      title: "Potential Single Point of Failure",
      explanation: `${input.service.name} has multiple critical dependents. This is a heuristic based on dependency fan-in, not a confirmed lack of redundancy.`,
      affectedEntity: { kind: "SERVICE", id: input.service.id, name: input.service.name },
    });
  }

  if (input.blastRadius && input.blastRadius.affectedServiceCount >= LARGE_BLAST_RADIUS_THRESHOLD) {
    const unhealthyNote =
      input.unhealthyAffectedServiceCount !== null && input.unhealthyAffectedServiceCount > 0
        ? ` ${input.unhealthyAffectedServiceCount} of them are already unhealthy right now.`
        : "";
    signals.push({
      type: "LARGE_BLAST_RADIUS",
      severity: input.unhealthyAffectedServiceCount !== null && input.unhealthyAffectedServiceCount > 0 ? "CRITICAL" : "WARNING",
      title: "Large Blast Radius",
      explanation: `A failure of this service would potentially affect ${input.blastRadius.affectedServiceCount} other services.${unhealthyNote}`,
      affectedEntity: entity,
    });
  }

  if (input.recurringIncidentCount >= RECURRING_INCIDENT_THRESHOLD) {
    signals.push({
      type: "RECURRING_INCIDENT_PATTERN",
      severity: "WARNING",
      title: "Recurring Incident Pattern",
      explanation: `${input.recurringIncidentCount} recurring incidents were observed on the same check(s) in the selected window.`,
      affectedEntity: entity,
    });
  } else if (input.healthStatus === "CRITICAL" || input.reasons.length > 0) {
    signals.push({
      type: "HIGH_INCIDENT_RATE",
      severity: input.healthStatus === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: "Elevated Incident Signal",
      explanation: input.reasons[0] ?? "This service's own health checks indicate a problem.",
      affectedEntity: entity,
    });
  }

  if (input.problemSummary && input.problemSummary.openCriticalCount > 0) {
    signals.push({
      type: "OPEN_CRITICAL_PROBLEM",
      severity: "CRITICAL",
      title: "Open Critical Problem",
      explanation: `${input.problemSummary.openCriticalCount} open problem(s) with CRITICAL priority are linked to this project.`,
      affectedEntity: entity,
    });
  }

  if (input.sloSummary?.worstSloStatus === "CRITICAL" || input.sloSummary?.worstSloStatus === "DEGRADED") {
    signals.push({
      type: "SLO_AT_RISK",
      severity: input.sloSummary.worstSloStatus === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: "SLO At Risk",
      explanation: `At least one SLO for this project is currently ${input.sloSummary.worstSloStatus}.`,
      affectedEntity: entity,
    });
    if (input.sloSummary.avgErrorBudgetRemainingPercent !== null && input.sloSummary.avgErrorBudgetRemainingPercent <= 0) {
      signals.push({
        type: "ERROR_BUDGET_LOW",
        severity: "CRITICAL",
        title: "Error Budget Exhausted",
        explanation: "The error budget for at least one SLO in this project is exhausted or negative.",
        affectedEntity: entity,
      });
    }
  }

  for (const change of input.activeChangeRisks) {
    if (change.verdict === "BLOCKED" || change.verdict === "WARNING") {
      signals.push({
        type: "HIGH_CHANGE_RISK",
        severity: change.verdict === "BLOCKED" ? "CRITICAL" : "WARNING",
        title: "High-Risk Active Change",
        explanation: `Change "${change.title}" has a risk verdict of ${change.verdict} (score ${change.score}).`,
        affectedEntity: { kind: "CHANGE", id: change.changeId, name: change.title },
      });
    }
  }

  for (const remediation of input.remediationEffectiveness) {
    if (remediation.status === "REGRESSED") {
      signals.push({
        type: "REGRESSED_REMEDIATION",
        severity: "WARNING",
        title: "Regressed Remediation",
        explanation: `Change "${remediation.changeTitle}" was meant to remediate a problem but the evidence shows regression instead of improvement.`,
        affectedEntity: { kind: "CHANGE", id: remediation.changeId, name: remediation.changeTitle },
      });
    }
  }

  // Phase 42 "Enterprise Resilience Forecast Intelligence" - rein
  // prospektiv, siehe Schwellenwert-Kommentar bei MIN_R_SQUARED_FOR_TREND
  // oben. Trend UND absoluter Schwellenwert muessen beide zutreffen (nicht
  // schon jede noch so flache negative/positive Steigung).
  const healthForecast = input.forecast.healthScore;
  if (
    healthForecast.sufficientData &&
    healthForecast.trend === "DEGRADING" &&
    healthForecast.projectedValue !== null &&
    healthForecast.projectedValue < HEALTH_SCORE_PROJECTED_THRESHOLD
  ) {
    signals.push({
      type: "PROJECTED_DEGRADATION",
      severity: "WARNING",
      title: "Projected Health Degradation",
      explanation: `Availability has been trending downward over the last 30 days and is projected to fall to ${healthForecast.projectedValue}% within ${healthForecast.forecastDays} days (R²=${healthForecast.rSquared}).`,
      affectedEntity: entity,
    });
  }

  const incidentForecast = input.forecast.incidentCount;
  if (
    incidentForecast.sufficientData &&
    incidentForecast.trend === "DEGRADING" &&
    incidentForecast.projectedValue !== null &&
    incidentForecast.currentValue !== null &&
    incidentForecast.projectedValue - incidentForecast.currentValue >= INCIDENT_COUNT_PROJECTED_INCREASE_THRESHOLD
  ) {
    signals.push({
      type: "PROJECTED_INCIDENT_INCREASE",
      severity: "WARNING",
      title: "Projected Incident Increase",
      explanation: `The daily incident rate has been trending upward over the last 30 days and is projected to reach ${incidentForecast.projectedValue}/day within ${incidentForecast.forecastDays} days (R²=${incidentForecast.rSquared}).`,
      affectedEntity: entity,
    });
  }

  // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" - siehe
  // RESPONSE_TIME_PROJECTED_INCREASE_FACTOR-Kommentar oben fuer die
  // Begruendung des relativen (statt absoluten) Schwellenwerts.
  // currentValue>0-Wache: bei ~0ms waere jede relative Aussage bedeutungslos.
  const responseTimeForecast = input.forecast.responseTimeMs;
  if (
    responseTimeForecast.sufficientData &&
    responseTimeForecast.trend === "DEGRADING" &&
    responseTimeForecast.projectedValue !== null &&
    responseTimeForecast.currentValue !== null &&
    responseTimeForecast.currentValue > 0 &&
    responseTimeForecast.projectedValue >= responseTimeForecast.currentValue * (1 + RESPONSE_TIME_PROJECTED_INCREASE_FACTOR)
  ) {
    signals.push({
      type: "PROJECTED_RESPONSE_TIME_DEGRADATION",
      severity: "WARNING",
      title: "Projected Response Time Degradation",
      explanation: `Average response time has been trending upward over the last 30 days (currently ${responseTimeForecast.currentValue}ms) and is projected to reach ${responseTimeForecast.projectedValue}ms within ${responseTimeForecast.forecastDays} days (R²=${responseTimeForecast.rSquared}) - a possible early sign of capacity exhaustion.`,
      affectedEntity: entity,
    });
  }

  return signals.slice(0, 10);
}
