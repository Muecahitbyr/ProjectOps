import { getServicesByIds, getServiceByProjectId, listServices } from "../db/services.repository";
import { listDependenciesForOrganization, listDependentsForServices } from "../db/service-dependencies.repository";
import { computeServiceHealth } from "./service-health";
import { getIncidents } from "../db/incidents.repository";
import { listSlos, getLatestSloEvaluationsForIds } from "../db/slo.repository";
import { listAlertRules } from "../db/alerts.repository";
import { MAX_TOPOLOGY_DEPTH, MAX_TOPOLOGY_NODES } from "../config/topology.config";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { recordAuditLog } from "./audit-log";
import { logger } from "./logger";
import type { Service, ServiceDependency } from "../types/service.types";
import type { Incident } from "../types/incident.types";
import type { AlertRule } from "../types/alert.types";
import type { Slo, SloStatus } from "../types/slo.types";

// Phase 23 Auftragspunkt 9 "Dependency Impact Analysis" - reine, begrenzte
// Rueckwaerts-Breitensuche ueber ECHTE, gespeicherte service_dependencies-
// Kanten (source->target = "source haengt von target ab"): "wer haengt
// (direkt oder transitiv) von diesem Service ab" bedeutet "wer hat eine
// Kante, die (moeglicherweise ueber mehrere Spruenge) auf diesen Service
// zeigt". Batched pro Ebene (listDependentsForServices), kein N+1
// (Auftragspunkt 24). Harte Tiefenbegrenzung verhindert unbegrenzte
// Rekursion, ein Visited-Set macht Zyklen sicher (kein Endlos-Loop).
//
// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis"
// erweitert das Ergebnis um `edges` (alle innerhalb des Blast-Radius
// entdeckten Kanten - ohnehin bereits pro Ebene abgefragt, hier nur nicht
// mehr verworfen) und `truncated` (Tiefenlimit erreicht, obwohl noch
// weitere Ebenen offen waren). Beides ermoeglicht findCriticalPaths()/
// findSpofCandidates() unten OHNE eine einzige zusaetzliche DB-Abfrage.
export interface ImpactResult {
  affectedServices: Service[];
  depthByServiceId: Map<number, number>;
  edges: ServiceDependency[];
  truncated: boolean;
}

export async function computeImpact(serviceId: number, maxDepth: number = MAX_TOPOLOGY_DEPTH): Promise<ImpactResult> {
  const visited = new Set<number>([serviceId]);
  const depthByServiceId = new Map<number, number>();
  const edges: ServiceDependency[] = [];
  let frontier = [serviceId];
  let truncated = false;

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const incomingEdges = await listDependentsForServices(frontier);
    const nextFrontier: number[] = [];
    for (const edge of incomingEdges) {
      edges.push(edge);
      if (!visited.has(edge.sourceServiceId)) {
        visited.add(edge.sourceServiceId);
        depthByServiceId.set(edge.sourceServiceId, depth);
        nextFrontier.push(edge.sourceServiceId);
      }
    }
    frontier = nextFrontier;
    if (depth === maxDepth && frontier.length > 0) truncated = true;
  }

  visited.delete(serviceId);
  const affectedServices = await getServicesByIds([...visited]);
  return { affectedServices, depthByServiceId, edges, truncated };
}

// Auftragspunkt 16 "Root Cause Support" - deterministische Hypothese, KEINE
// KI/Heuristik: steigt entlang der bereits von core/service-health.ts
// berechneten unhealthyDependencies-Kette bis zu den "Blaettern" ab (ein
// unhealthy Service, dessen EIGENE Checks das Problem sind, nicht nur eine
// geerbte Verschlechterung von einer weiteren Abhaengigkeit) - das sind die
// plausibelsten Ausloeser. Ausdruecklich als "potenzielle" Ursache markiert
// (Auftrag: "nicht als definitive Wahrheit").
export interface RootCauseCandidate {
  serviceId: number;
  name: string;
  reason: string;
}

export async function findRootCauseCandidates(serviceId: number): Promise<RootCauseCandidate[]> {
  const health = await computeServiceHealth(serviceId);
  if (health.status === "HEALTHY" || health.status === "UNKNOWN") return [];

  const candidates: RootCauseCandidate[] = [];
  const visited = new Set<number>([serviceId]);
  let frontier = health.unhealthyDependencies.map((d) => d.serviceId);

  for (let depth = 0; depth < MAX_TOPOLOGY_DEPTH && frontier.length > 0; depth++) {
    const nextFrontier: number[] = [];
    for (const depId of frontier) {
      if (visited.has(depId)) continue;
      visited.add(depId);
      const depHealth = await computeServiceHealth(depId);
      if (depHealth.unhealthyDependencies.length === 0 && (depHealth.status === "DEGRADED" || depHealth.status === "CRITICAL")) {
        // Blatt: eigene Checks sind das Problem, keine weitere kranke
        // Abhaengigkeit dahinter - staerkster Root-Cause-Kandidat.
        const service = (await getServicesByIds([depId]))[0];
        if (service) candidates.push({ serviceId: depId, name: service.name, reason: "Own checks are unhealthy, no further unhealthy dependency found" });
      } else {
        nextFrontier.push(...depHealth.unhealthyDependencies.map((d) => d.serviceId));
      }
    }
    frontier = nextFrontier;
  }

  // Falls kein reines Blatt gefunden wurde (z.B. Tiefenlimit erreicht),
  // faellt die naechstliegende, direkt beobachtete Ursache als Kandidat
  // zurueck - besser eine plausible Vermutung als keine.
  if (candidates.length === 0 && health.unhealthyDependencies.length > 0) {
    const first = health.unhealthyDependencies[0]!;
    candidates.push({ serviceId: first.serviceId, name: first.name, reason: "Directly unhealthy critical dependency" });
  }
  return candidates;
}

// Auftragspunkt 12 "Topology Graph" - liefert den vollstaendigen,
// tenant-gescopten Graph (Nodes=Services, Edges=Dependencies) fuer
// GET /platform/topology bzw. GET /v1/topology. Begrenzt auf
// MAX_TOPOLOGY_NODES (Auftragspunkt 24 "sinnvolle Query-Limits").
export interface TopologyGraph {
  nodes: Service[];
  edges: ServiceDependency[];
  truncated: boolean;
}

export async function buildTopologyGraph(organizationId: string, teamId?: string): Promise<TopologyGraph> {
  const allNodes = await listServices({ organizationId, ...(teamId ? { teamId } : {}) });
  const truncated = allNodes.length > MAX_TOPOLOGY_NODES;
  const nodes = truncated ? allNodes.slice(0, MAX_TOPOLOGY_NODES) : allNodes;
  const nodeIds = new Set(nodes.map((n) => n.id));

  const allEdges = await listDependenciesForOrganization(organizationId);
  const edges = allEdges.filter((e) => nodeIds.has(e.sourceServiceId) && nodeIds.has(e.targetServiceId));

  return { nodes, edges, truncated };
}

// ---------------------------------------------------------------------------
// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
// alles unten baut ausschliesslich auf dem bereits von computeImpact() oben
// ermittelten Blast-Radius (affectedServices/edges) auf. Keine zweite
// Graph-Engine, keine zusaetzlichen Traversierungs-Abfragen.
// ---------------------------------------------------------------------------

export interface ImpactDepthGroup {
  depth: number;
  services: Service[];
}

// Auftragspunkt "Betroffene Services nach Tiefe/Entfernung gruppiert" - reine
// In-Memory-Umformung von depthByServiceId, keine weitere Abfrage.
export function groupImpactByDepth(impact: ImpactResult): ImpactDepthGroup[] {
  const byId = new Map(impact.affectedServices.map((s) => [s.id, s]));
  const groups = new Map<number, Service[]>();
  for (const [serviceId, depth] of impact.depthByServiceId) {
    const service = byId.get(serviceId);
    if (!service) continue;
    if (!groups.has(depth)) groups.set(depth, []);
    groups.get(depth)!.push(service);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, services]) => ({ depth, services: services.sort((a, b) => a.name.localeCompare(b.name)) }));
}

export interface CriticalPathNode {
  serviceId: number;
  name: string;
}

export interface CriticalPath {
  services: CriticalPathNode[];
  length: number;
}

// Auftragspunkt "Kritische Pfade im Dependency-Graph" - ein "kritischer Pfad"
// ist hier bewusst eng UND nachvollziehbar definiert: eine ununterbrochene
// Kette von Abhaengigkeitskanten mit criticality=CRITICAL, ausgehend vom
// analysierten Service durch seinen Blast-Radius. Das ist die Kette, die bei
// einem Ausfall garantiert (nicht nur "moeglicherweise ueber eine optionale
// Abhaengigkeit") weitergereicht wird. Laengste(r) Pfad(e) zuerst - bei
// Gleichstand deterministisch nach Service-ID sortiert (keine zufaellige
// Reihenfolge zwischen Aufrufen). DFS ueber den bereits vorhandenen
// edges-Array (keine weitere DB-Abfrage), zyklensicher ueber ein
// Pfad-lokales Visited-Set.
export function findCriticalPaths(rootService: Pick<Service, "id" | "name">, impact: ImpactResult, maxPaths = 3): CriticalPath[] {
  const serviceId = rootService.id;
  // Der analysierte Service selbst ist per Definition NIE Teil seines
  // eigenen Blast-Radius (computeImpact() loescht ihn bewusst aus dem
  // Ergebnis, siehe dort) - ohne diesen expliziten Eintrag wuerde
  // byId.get(serviceId) fuer die WURZEL des Pfades immer leer bleiben und
  // als "Service #<id>" statt mit echtem Namen erscheinen. Live im eigenen
  // E2E-Test gefunden (Critical-Path-Zusammenfassung zeigte "Service #69"
  // statt "Database").
  const byId = new Map<number, Pick<Service, "id" | "name">>(impact.affectedServices.map((s) => [s.id, s]));
  byId.set(serviceId, rootService);

  // Adjazenz "wer haengt (kritisch) direkt von X ab" (source->target mit
  // target=X, criticality=CRITICAL) - dieselbe Richtung wie computeImpact().
  const criticalDependentsOf = new Map<number, number[]>();
  for (const edge of impact.edges) {
    if (edge.criticality !== "CRITICAL") continue;
    if (!criticalDependentsOf.has(edge.targetServiceId)) criticalDependentsOf.set(edge.targetServiceId, []);
    criticalDependentsOf.get(edge.targetServiceId)!.push(edge.sourceServiceId);
  }
  for (const list of criticalDependentsOf.values()) list.sort((a, b) => a - b);

  const allPaths: number[][] = [];
  function dfs(current: number, path: number[], visited: Set<number>): void {
    const next = criticalDependentsOf.get(current) ?? [];
    const deadEnd = next.every((n) => visited.has(n));
    if (next.length === 0 || deadEnd) {
      if (path.length > 1) allPaths.push([...path]);
      return;
    }
    for (const n of next) {
      if (visited.has(n)) continue;
      visited.add(n);
      path.push(n);
      dfs(n, path, visited);
      path.pop();
      visited.delete(n);
    }
  }
  dfs(serviceId, [serviceId], new Set([serviceId]));

  allPaths.sort((a, b) => b.length - a.length || a.join(",").localeCompare(b.join(",")));

  const seen = new Set<string>();
  const result: CriticalPath[] = [];
  for (const path of allPaths) {
    const key = path.join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      services: path.map((id) => ({ serviceId: id, name: byId.get(id)?.name ?? `Service #${id}` })),
      length: path.length - 1,
    });
    if (result.length >= maxPaths) break;
  }
  return result;
}

export interface SpofCandidate {
  serviceId: number;
  name: string;
  criticalDependentCount: number;
  totalDependentCount: number;
}

// Auftragspunkt "Single Point of Failure-Kandidaten (optional)" - bewusst
// als Heuristik dokumentiert, KEINE formale Graph-Schnittknoten-Analyse
// (Auftragspunkt-Formulierung "optional" + "keine KI/Vermutung als
// Tatsache", analog zu findRootCauseCandidates() oben): ein Service gilt
// als SPOF-Kandidat, wenn mindestens `threshold` andere Services KRITISCH
// direkt von ihm abhaengen (hoher Fan-In ohne erkennbare Redundanz-Aussage -
// echte Redundanz muesste man an Anwendungslogik ausserhalb dieses Graphen
// festmachen, das behauptet diese Funktion nicht).
// Auftragspunkt "Single Point of Failure" - derselbe Grund wie oben bei
// findCriticalPaths() fuer den expliziten rootService-Parameter: die
// Wurzel des Blast-Radius ist der mit Abstand wahrscheinlichste SPOF-
// Kandidat ueberhaupt (alles im Ergebnis haengt ja von IHR ab), fehlte aber
// bislang systematisch, weil sie nie in impact.affectedServices auftaucht.
export function findSpofCandidates(rootService: Pick<Service, "id" | "name">, impact: ImpactResult, threshold = 2): SpofCandidate[] {
  const byId = new Map<number, Pick<Service, "id" | "name">>(impact.affectedServices.map((s) => [s.id, s]));
  byId.set(rootService.id, rootService);
  const totalDependents = new Map<number, number>();
  const criticalDependents = new Map<number, number>();
  for (const edge of impact.edges) {
    totalDependents.set(edge.targetServiceId, (totalDependents.get(edge.targetServiceId) ?? 0) + 1);
    if (edge.criticality === "CRITICAL") {
      criticalDependents.set(edge.targetServiceId, (criticalDependents.get(edge.targetServiceId) ?? 0) + 1);
    }
  }

  const candidates: SpofCandidate[] = [];
  for (const [serviceId, criticalCount] of criticalDependents) {
    if (criticalCount < threshold) continue;
    const service = byId.get(serviceId);
    if (!service) continue;
    candidates.push({
      serviceId,
      name: service.name,
      criticalDependentCount: criticalCount,
      totalDependentCount: totalDependents.get(serviceId) ?? criticalCount,
    });
  }
  return candidates.sort((a, b) => b.criticalDependentCount - a.criticalDependentCount || a.serviceId - b.serviceId);
}

export interface RelatedIncidentSummary {
  id: number;
  serviceId: number;
  serviceName: string;
  severity: string;
  title: string;
}

export interface RelatedSloSummary {
  id: number;
  serviceId: number;
  serviceName: string;
  name: string;
  status: SloStatus | "PENDING";
}

export interface RelatedAlertSummary {
  id: number;
  serviceId: number;
  serviceName: string;
  name: string;
  currentlyTriggered: boolean;
}

export interface RelatedSignals {
  openIncidents: RelatedIncidentSummary[];
  atRiskSlos: RelatedSloSummary[];
  triggeredAlerts: RelatedAlertSummary[];
}

// Auftragspunkt "Welche Incidents/SLOs/Alerts mit dem betroffenen Service
// zusammenhaengen" - genau EINE Batch-Abfrage je Ressourcentyp fuer ALLE
// betroffenen Projekte zusammen (getIncidents/listSlos/listAlertRules mit
// projectIds, siehe db/*.repository.ts), kein N+1 pro Service. Nur Services
// MIT verknuepftem Projekt (services.projectId, Phase 23) koennen ueberhaupt
// eigene Incidents/SLOs/Alerts haben - reine Katalogeintraege ohne Projekt
// werden hier uebersprungen, keine erfundenen Daten.
export async function getRelatedSignals(services: Service[]): Promise<RelatedSignals> {
  const serviceByProjectId = new Map<string, Service>();
  for (const s of services) {
    if (s.projectId) serviceByProjectId.set(s.projectId, s);
  }
  const projectIds = [...serviceByProjectId.keys()];
  if (projectIds.length === 0) {
    return { openIncidents: [], atRiskSlos: [], triggeredAlerts: [] };
  }

  const [incidents, slos, alertRules] = await Promise.all([
    getIncidents({ projectIds, resolved: false, limit: 200 }),
    listSlos({ projectIds, enabled: true }),
    listAlertRules({ projectIds }),
  ]);

  const openIncidents: RelatedIncidentSummary[] = incidents.map((i: Incident) => {
    const service = serviceByProjectId.get(i.projectId)!;
    return { id: i.id, serviceId: service.id, serviceName: service.name, severity: i.severity, title: i.title };
  });

  const sloEvaluations = await getLatestSloEvaluationsForIds(slos.map((s) => s.id));
  const atRiskSlos: RelatedSloSummary[] = slos
    .filter((s: Slo) => s.projectId && serviceByProjectId.has(s.projectId))
    .map((s: Slo) => {
      const service = serviceByProjectId.get(s.projectId!)!;
      const status: SloStatus | "PENDING" = sloEvaluations.get(s.id)?.status ?? "PENDING";
      return { id: s.id, serviceId: service.id, serviceName: service.name, name: s.name, status };
    })
    .filter((s) => s.status === "DEGRADED" || s.status === "CRITICAL");

  const triggeredAlerts: RelatedAlertSummary[] = alertRules
    .filter((a: AlertRule) => a.currentlyTriggered)
    .map((a: AlertRule) => {
      const service = serviceByProjectId.get(a.projectId)!;
      return { id: a.id, serviceId: service.id, serviceName: service.name, name: a.name, currentlyTriggered: a.currentlyTriggered };
    });

  return { openIncidents, atRiskSlos, triggeredAlerts };
}

export interface ImpactSummary {
  text: string;
  affectedCount: number;
  maxDepthReached: number;
  hasCriticalPath: boolean;
  spofCount: number;
}

// Auftragspunkt "Eine verstaendliche Impact-Zusammenfassung fuer Incident
// Response" - ein kurzer, deterministisch generierter Satz (keine KI), der
// die wichtigsten Zahlen fuer eine Person im Incident-Response-Kontext
// zusammenfasst, die keine Zeit hat, den Graphen selbst zu lesen.
export function buildImpactSummary(
  service: Pick<Service, "id" | "name">,
  impact: ImpactResult,
  criticalPaths: CriticalPath[],
  spofCandidates: SpofCandidate[],
  related: RelatedSignals,
): ImpactSummary {
  const affectedCount = impact.affectedServices.length;
  const maxDepthReached = Math.max(0, ...impact.depthByServiceId.values());
  const parts: string[] = [];

  if (affectedCount === 0) {
    parts.push(`No other cataloged services depend on "${service.name}" - its blast radius is limited to itself.`);
  } else {
    parts.push(`If "${service.name}" fails, up to ${affectedCount} other service${affectedCount === 1 ? "" : "s"} could be affected across ${maxDepthReached} dependency level${maxDepthReached === 1 ? "" : "s"}.`);
  }
  if (criticalPaths.length > 0 && criticalPaths[0]) {
    parts.push(`The longest guaranteed (all-critical) cascade is ${criticalPaths[0].length} hop${criticalPaths[0].length === 1 ? "" : "s"} long: ${criticalPaths[0].services.map((s) => s.name).join(" -> ")}.`);
  }
  if (spofCandidates.length > 0) {
    parts.push(`${spofCandidates.length} service${spofCandidates.length === 1 ? "" : "s"} in this blast radius look${spofCandidates.length === 1 ? "s" : ""} like a single point of failure (multiple critical dependents, no visible redundancy).`);
  }
  if (related.openIncidents.length > 0) {
    parts.push(`${related.openIncidents.length} open incident${related.openIncidents.length === 1 ? "" : "s"} already affect${related.openIncidents.length === 1 ? "s" : ""} services in this blast radius.`);
  }
  if (related.atRiskSlos.length > 0) {
    parts.push(`${related.atRiskSlos.length} SLO${related.atRiskSlos.length === 1 ? "" : "s"} in this blast radius ${related.atRiskSlos.length === 1 ? "is" : "are"} currently degraded or breached.`);
  }
  if (impact.truncated) {
    parts.push(`This analysis was capped at ${MAX_TOPOLOGY_DEPTH} dependency levels - the real blast radius may be larger.`);
  }

  return {
    text: parts.join(" "),
    affectedCount,
    maxDepthReached,
    hasCriticalPath: criticalPaths.length > 0,
    spofCount: spofCandidates.length,
  };
}

// ---------------------------------------------------------------------------
// Kurzzeitiger In-Memory-Cache fuer die TEURE Vollanalyse (Blast-Radius +
// Related Signals ueber mehrere Repositories) - Auftrag: "keine unnoetige
// dauerhafte Duplikation von Rohdaten", daher bewusst NICHT in einer Tabelle
// persistiert, sondern ein handgerolltes Map+TTL nach demselben, bereits im
// Projekt etablierten Muster wie core/distributed-scheduler.ts#assignmentCache
// (kein generisches Cache-Utility vorhanden, keins fuer eine einzelne
// Verwendungsstelle eingefuehrt). 15s TTL: kurz genug, dass ein gerade erst
// geaenderter Graph (Dependency hinzugefuegt/geloescht) nicht lange veraltet
// bleibt, lang genug, um wiederholte Seitenaufrufe/Polling abzufedern. Wird
// zusaetzlich aktiv geleert, sobald sich ein Service/eine Dependency aendert
// (siehe routes/platform-services.routes.ts).
const IMPACT_CACHE_TTL_MS = 15_000;
interface CachedImpactAnalysis {
  computedAt: number;
  analysis: FullImpactAnalysis;
}
const impactAnalysisCache = new Map<number, CachedImpactAnalysis>();

export interface FullImpactAnalysis {
  affectedServices: (Service & { depth: number | null })[];
  maxDepth: number;
  truncated: boolean;
  depthGroups: ImpactDepthGroup[];
  criticalPaths: CriticalPath[];
  spofCandidates: SpofCandidate[];
  related: RelatedSignals;
  summary: ImpactSummary;
}

async function computeFullImpactAnalysis(service: Service): Promise<FullImpactAnalysis> {
  const impact = await computeImpact(service.id);
  const criticalPaths = findCriticalPaths(service, impact);
  const spofCandidates = findSpofCandidates(service, impact);
  const related = await getRelatedSignals([service, ...impact.affectedServices]);
  const summary = buildImpactSummary(service, impact, criticalPaths, spofCandidates, related);
  return {
    affectedServices: impact.affectedServices.map((s) => ({ ...s, depth: impact.depthByServiceId.get(s.id) ?? null })),
    maxDepth: MAX_TOPOLOGY_DEPTH,
    truncated: impact.truncated,
    depthGroups: groupImpactByDepth(impact),
    criticalPaths,
    spofCandidates,
    related,
    summary,
  };
}

export async function getFullImpactAnalysis(service: Service, options: { fresh?: boolean } = {}): Promise<FullImpactAnalysis> {
  const cached = impactAnalysisCache.get(service.id);
  if (!options.fresh && cached && Date.now() - cached.computedAt < IMPACT_CACHE_TTL_MS) {
    return cached.analysis;
  }
  const analysis = await computeFullImpactAnalysis(service);
  impactAnalysisCache.set(service.id, { computedAt: Date.now(), analysis });
  return analysis;
}

// Aufgerufen von routes/platform-services.routes.ts nach jeder Service-/
// Dependency-Mutation (Create/Update/Delete) - haelt den Cache konsistent,
// ohne auf den TTL warten zu muessen. Leert bewusst den GESAMTEN Cache
// (nicht nur den einen Service): eine neue/geloeschte Dependency kann den
// Blast-Radius JEDES anderen Services in derselben Organisation veraendern,
// und die Map ist klein genug (durch die Services-Quota gedeckelt), dass
// ein voller Clear guenstiger ist als eine gezielte, aber fehleranfaellige
// Invalidations-Traversierung.
export function invalidateImpactAnalysisCache(): void {
  impactAnalysisCache.clear();
}

// ---------------------------------------------------------------------------
// Phase 25 "Automatische Integration" - EIN Aufruf, fire-and-forget (siehe
// Aufrufstellen: core/monitor.ts INCIDENT_CREATED, core/slo-evaluator.ts
// SLO_BREACHED, alerts/alert-evaluator.ts ALERT_TRIGGERED), niemals awaited
// im Hot Path - exakt dasselbe Prinzip wie die dortigen bereits
// vorhandenen `void dispatchWebhookEvent(...)`/`void dispatchNotificationEvent(...)`-
// Aufrufe. Keine neue Event-Pipeline: nutzt broadcast() + recordAuditLog()
// unveraendert. Wirft NIE (wie core/audit-log.ts#recordAuditLog) - ein
// Fehler hier darf niemals die eigentliche Ueberwachung/Alarmierung stoeren.
export async function notifyImpactIfSignificant(
  projectId: string,
  trigger: "INCIDENT" | "SLO_BREACH" | "ALERT",
  triggerLabel: string,
): Promise<void> {
  try {
    const service = await getServiceByProjectId(projectId);
    if (!service) return; // Projekt hat keinen verknuepften Katalog-Service - nichts zu tun.

    const analysis = await getFullImpactAnalysis(service);
    if (analysis.affectedServices.length === 0) return; // Kein Blast-Radius, kein Rauschen erzeugen.

    broadcast(
      createEvent(RealtimeEventType.SERVICE_IMPACT_DETECTED, {
        serviceId: service.id,
        serviceName: service.name,
        organizationId: service.organizationId,
        affectedCount: analysis.affectedServices.length,
        trigger,
        triggerLabel,
      }),
    );
    void recordAuditLog({
      action: "SERVICE_IMPACT_DETECTED",
      category: "SERVICE",
      projectId,
      message: `${triggerLabel} on "${service.name}" - potential impact on ${analysis.affectedServices.length} other service(s)`,
      metadata: { serviceId: service.id, organizationId: service.organizationId, affectedCount: analysis.affectedServices.length, trigger },
    });
  } catch (err) {
    logger.error("Impact-Benachrichtigung fehlgeschlagen", {
      projectId,
      trigger,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
  }
}
