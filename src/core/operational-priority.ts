// Phase 43 "Enterprise Operational Priority Intelligence" - Bestandsanalyse:
// core/service-resilience.ts (Phase 37/41/42) berechnet je Projekt bereits
// resilienceStatus, bis zu 10 ResilienceSignal(s) und einen Forecast-Trend.
// core/resilience-alerting.ts (38) und automation/automation-engine.ts (40)
// reagieren bereits REAKTIV auf Statusuebergaenge. Es fehlt eine PULL-basierte,
// org-weite, nach Dringlichkeit sortierte Sicht mit nachvollziehbarer
// Begruendung ("worum sollte ich mich zuerst kuemmern und warum") - das ist
// die alleinige, additive Aufgabe dieses Moduls.
//
// Keine neue Intelligence-Engine: JEDES verwendete Signal stammt unveraendert
// aus buildResilienceOverview()/buildServiceResilienceDetail(). Dieses Modul
// fuegt ausschliesslich zwei rein deterministische Ableitungen hinzu, beide
// vollstaendig transparent (kein KI-/Black-Box-Scoring, siehe Auftrag
// "Entscheidungsqualitaet"):
//   1. priorityScore - eine dokumentierte, additive Gewichtungsformel aus
//      bereits vorhandenen numerischen Feldern (computePriorityScore()).
//   2. recommendedAction - ein statisches Lookup vom bereits vorhandenen,
//      schwerwiegendsten Signaltyp zu einem Handlungstext
//      (RECOMMENDED_ACTION_BY_SIGNAL). Kein Freitext, keine KI-Formulierung.
//
// Skalierbarkeit (Auftragspunkt 7 "Performance"): die TEURE Detailberechnung
// (buildServiceResilienceDetail(), holt Signals+Forecast) wird NICHT fuer
// jedes nicht-gesunde Projekt aufgerufen, sondern erst NACH der billigen
// Vorsortierung (allein aus bereits im Overview vorhandenen Feldern) und nur
// fuer die tatsaechlich zurueckgegebenen Top-N Eintraege (Standard 20, max
// 100) - unabhaengig davon, wie viele Projekte insgesamt nicht "HEALTHY"
// sind. buildResilienceOverview() selbst ist bereits gecacht (Phase 41).
//
// Historisierung (Auftragspunkt 8): bewusst KEINE neue Tabelle. Der
// Vergleich "Empfehlung vs. tatsaechliches Ergebnis" ist bereits ueber die
// bestehende Remediation-Effectiveness-Kette (Phase 36, sichtbar in
// detail.remediationEffectiveness) moeglich, sobald ein empfohlenes Problem
// tatsaechlich mit einem Change adressiert wird - Phase 43 macht diese
// Verbindung nur sichtbar, dupliziert sie nicht. Die Warteschlange selbst
// ist wie ResilienceOverview vollstaendig live abgeleitet ("derive, don't
// store"), `generatedAt` im Response reicht als Nachvollziehbarkeits-
// Zeitstempel fuer einen Konsumenten, der Snapshots vergleichen will.
import { buildResilienceOverview, buildServiceResilienceDetail, RESILIENCE_RANK } from "./service-resilience";
import { getLatestAuditEntriesForProjects, createAuditLogEntry } from "../db/audit-log.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type {
  PriorityQueue,
  PriorityQueueEntry,
  PriorityQueueConfidence,
  PriorityQueueAcknowledgment,
  ResilienceOverviewRow,
  ResilienceSignal,
  ResilienceSignalType,
  ResilienceSignalSeverity,
  ResilienceStatus,
} from "../types/resilience.types";

export interface PriorityQueueFilter {
  organizationId: string;
  hours: number;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Deterministische, additive Score-Formel (Auftrag: "keine undurchsichtige
// Black-Box-Logik") - jedes Gewicht ist eine eigene, hier dokumentierte
// Annahme (keine externe Vorgabe), analog zu den bereits etablierten
// Schwellenwerten in core/service-resilience.ts:
//   - resilienceStatus dominiert klar (Faktor 1000) - ein CRITICAL-Projekt
//     steht IMMER vor jedem AT_RISK-Projekt, unabhaengig von den restlichen
//     Faktoren (die nur INNERHALB derselben Statusstufe sortieren).
//   - openCriticalProblems (+100): ein ungeloestes CRITICAL-Problem ist der
//     staerkste Einzelindikator fuer sofortigen Handlungsbedarf.
//   - isPotentialSpof (+50): ein Ausfall traefe ueberdurchschnittlich viele
//     andere Services.
//   - errorBudgetRisk (+30): SLO-Budget bereits angegriffen/aufgebraucht.
//   - blastRadius / highCriticalCount: gedeckelte (min(...,20)/min(...,10))
//     graduelle Beitraege - verhindern, dass ein einzelner sehr grosser Wert
//     die uebrigen Faktoren komplett ueberdeckt (dieselbe "Deckelung gegen
//     Ausreisser"-Idee wie MAX_TOPOLOGY_NODES/MAX_TOPOLOGY_DEPTH).
// Phase 54 "Enterprise Predictive Operations & Risk Prevention" -
// EXPORTIERT statt inline, damit core/capacity-intelligence.ts denselben
// Abhaengigkeits-Risiko-Gewichtungsstandard fuer die (bisher rein
// signalbasierte) proaktive Watchlist-Rangfolge wiederverwenden kann, statt
// eine zweite, potenziell abweichende Gewichtung zu erfinden - reine
// Extraktion, KEINE Verhaltensaenderung an computePriorityScore() selbst.
export const SPOF_PRIORITY_WEIGHT = 50;
export const BLAST_RADIUS_PRIORITY_CAP = 20;

function computePriorityScore(row: ResilienceOverviewRow): number {
  return (
    RESILIENCE_RANK[row.resilienceStatus] * 1000 +
    (row.openCriticalProblems > 0 ? 100 : 0) +
    (row.isPotentialSpof ? SPOF_PRIORITY_WEIGHT : 0) +
    (row.errorBudgetRisk ? 30 : 0) +
    Math.min(row.blastRadius, BLAST_RADIUS_PRIORITY_CAP) +
    Math.min(row.highCriticalCount, 10)
  );
}

// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" nutzt
// dieselbe Schweregrad-Rangfolge/Auswahl fuer die Watchlist - EXPORTIERT
// statt in core/capacity-intelligence.ts erneut definiert.
export const SIGNAL_SEVERITY_RANK: Record<ResilienceSignalSeverity, number> = { CRITICAL: 2, WARNING: 1, INFO: 0 };

// Der "primaere Grund" ist deterministisch das schwerwiegendste Signal
// (CRITICAL vor WARNING vor INFO); bei Gleichstand gewinnt das zuerst von
// buildResilienceSignalsFromDetail() erzeugte (stabile Sortierung, kein
// zufaelliges Tie-Breaking).
export function pickPrimarySignal(signals: ResilienceSignal[]): ResilienceSignal | undefined {
  return [...signals].sort((a, b) => SIGNAL_SEVERITY_RANK[b.severity] - SIGNAL_SEVERITY_RANK[a.severity])[0];
}

// Statisches Lookup, kein Freitext/keine KI-Formulierung - jeder Text
// verweist auf eine bereits existierende, bekannte naechste Handlung
// innerhalb der Plattform (Problem/Change/SLO/Service ueberpruefen).
// Phase 64 "Enterprise Operational Priority & Attention Management" -
// EXPORTIERT statt in core/attention.ts erneut definiert, damit dessen
// CHANGE-Eintraege exakt denselben, hier bereits etablierten Handlungstext
// fuer "riskante aktive Aenderung" wiederverwenden statt eine zweite,
// potenziell abweichende Formulierung einzufuehren.
export const RECOMMENDED_ACTION_BY_SIGNAL: Record<ResilienceSignalType, string> = {
  OPEN_CRITICAL_PROBLEM: "Review and mitigate the linked critical problem.",
  HIGH_CHANGE_RISK: "Review the active change's risk assessment before it proceeds.",
  REGRESSED_REMEDIATION: "Re-evaluate the remediation change - evidence shows regression instead of improvement.",
  POTENTIAL_SINGLE_POINT_OF_FAILURE: "Evaluate redundancy options for this service; multiple critical dependents rely on it.",
  LARGE_BLAST_RADIUS: "Review the dependency graph; a failure here would affect many other services.",
  CRITICAL_DEPENDENCY_UNHEALTHY: "Investigate the unhealthy critical dependency this service relies on.",
  SLO_AT_RISK: "Review the at-risk SLO and its error budget consumption.",
  ERROR_BUDGET_LOW: "Error budget is exhausted - consider pausing risky changes until it recovers.",
  RECURRING_INCIDENT_PATTERN: "Investigate the root cause of the recurring incident pattern on this check.",
  HIGH_INCIDENT_RATE: "Investigate the elevated incident signal on this service's own checks.",
  PROJECTED_DEGRADATION: "Investigate proactively - availability is trending toward a critical threshold (forecast-based).",
  PROJECTED_INCIDENT_INCREASE: "Investigate proactively - incident rate is trending upward (forecast-based).",
  // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence".
  PROJECTED_RESPONSE_TIME_DEGRADATION: "Investigate proactively - response time is trending upward, a possible early sign of capacity exhaustion (forecast-based).",
};
const FALLBACK_RECOMMENDED_ACTION = "Review the project's resilience detail page for contributing signals.";

// Confidence (Auftragspunkt 7 "Confidence bzw. Zuverlaessigkeit"): Signale,
// die aus dem statistischen Forecast (Phase 42, eine Prognose ueber die
// Zukunft) stammen, sind grundsaetzlich unsicherer als Signale, die den
// AKTUELLEN, bereits eingetretenen Zustand beschreiben - deshalb MEDIUM
// statt HIGH, wenn der primaere Grund einer der beiden PROJECTED_*-Typen ist.
// Phase 46 ergaenzt PROJECTED_RESPONSE_TIME_DEGRADATION als drittes,
// ebenfalls forecast-basiertes Signal in dieselbe Menge.
const FORECAST_SIGNAL_TYPES = new Set<ResilienceSignalType>(["PROJECTED_DEGRADATION", "PROJECTED_INCIDENT_INCREASE", "PROJECTED_RESPONSE_TIME_DEGRADATION"]);

function confidenceFor(signal: ResilienceSignal | undefined): PriorityQueueConfidence {
  return signal && FORECAST_SIGNAL_TYPES.has(signal.type) ? "MEDIUM" : "HIGH";
}

// Phase 44 "Enterprise Priority Queue Acknowledgment Governance" -
// Bestandsanalyse: core/audit-log.ts/db/audit-log.repository.ts (bestehend
// seit Phase 1, seither von JEDER Phase fuer Nachvollziehbarkeit genutzt,
// zuletzt Phase 38 fuer Resilience-Statuswechsel) ist die einzige
// Audit-Infrastruktur dieses Systems - hier unveraendert wiederverwendet,
// KEINE zweite History-Tabelle. Der aktuelle Bestaetigungszustand eines
// Projekts wird bei jeder Anfrage live aus dem juengsten passenden
// audit_log-Eintrag abgeleitet (siehe getLatestAuditEntriesForProjects()) -
// exakt dasselbe "derive, don't store"-Prinzip wie resilienceStatus selbst.
// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence" wertet dieselben zwei Aktionsnamen aus (welche Bestaetigung
// wurde von welchem Statuswechsel gefolgt/beendet) - EXPORTIERT statt in
// core/outcome-intelligence.ts erneut definiert, um einen Drift der beiden
// Aktionsnamen zwischen den Modulen auszuschliessen.
export const ACKNOWLEDGED_ACTION = "PRIORITY_QUEUE_ACKNOWLEDGED";
// Bereits bestehende Aktionsnamen aus core/resilience-alerting.ts (Phase 38) -
// eine Bestaetigung gilt nur so lange als AKTUELL, wie seither KEIN neuerer
// Statuswechsel-Eintrag fuer dasselbe Projekt aufgetreten ist. Verfaellt
// dadurch automatisch bei einer echten Verschlechterung, ohne eigene
// Ablauf-/TTL-Logik.
export const TRANSITION_ACTIONS = ["RESILIENCE_STATUS_DEGRADED", "RESILIENCE_STATUS_RECOVERED"];

interface RankedEntry {
  row: ResilienceOverviewRow;
  score: number;
}

async function buildEntry(ranked: RankedEntry, hours: number, ack: PriorityQueueAcknowledgment | null): Promise<PriorityQueueEntry> {
  const detail = await buildServiceResilienceDetail(ranked.row.projectId, hours);
  const signals = detail?.signals ?? [];
  const primarySignal = pickPrimarySignal(signals);
  return {
    projectId: ranked.row.projectId,
    projectName: ranked.row.projectName,
    serviceId: ranked.row.serviceId,
    serviceName: ranked.row.serviceName,
    resilienceStatus: ranked.row.resilienceStatus,
    priorityScore: ranked.score,
    primaryReason: primarySignal
      ? { signalType: primarySignal.type, severity: primarySignal.severity, title: primarySignal.title, explanation: primarySignal.explanation }
      : null,
    recommendedAction: primarySignal ? (RECOMMENDED_ACTION_BY_SIGNAL[primarySignal.type] ?? FALLBACK_RECOMMENDED_ACTION) : FALLBACK_RECOMMENDED_ACTION,
    confidence: confidenceFor(primarySignal),
    signalCount: signals.length,
    acknowledgment: ack,
  };
}

function toAcknowledgment(entry: { userId: string | null; createdAt: string; metadata: Record<string, unknown> | null } | undefined): PriorityQueueAcknowledgment | null {
  if (!entry || !entry.userId) return null;
  const metadata = entry.metadata ?? {};
  return {
    acknowledgedBy: entry.userId,
    acknowledgedAt: entry.createdAt,
    note: typeof metadata.note === "string" ? metadata.note : null,
    snapshotResilienceStatus: (typeof metadata.resilienceStatus === "string" ? metadata.resilienceStatus : "UNKNOWN") as ResilienceStatus,
    snapshotPriorityScore: typeof metadata.priorityScore === "number" ? metadata.priorityScore : 0,
    snapshotReason: typeof metadata.reasonTitle === "string" ? metadata.reasonTitle : null,
  };
}

// Batched fuer eine ganze Projekt-Liste (Auftragspunkt "keine unnoetigen
// Datenbankabfragen") - je EINE Abfrage fuer Bestaetigungen und
// Statuswechsel, unabhaengig von der Anzahl der Projekte.
async function loadAcknowledgments(projectIds: string[]): Promise<Map<string, PriorityQueueAcknowledgment | null>> {
  if (projectIds.length === 0) return new Map();
  const [acknowledged, transitions] = await Promise.all([
    getLatestAuditEntriesForProjects(projectIds, [ACKNOWLEDGED_ACTION]),
    getLatestAuditEntriesForProjects(projectIds, TRANSITION_ACTIONS),
  ]);

  const result = new Map<string, PriorityQueueAcknowledgment | null>();
  for (const projectId of projectIds) {
    const ackEntry = acknowledged.get(projectId);
    const transitionEntry = transitions.get(projectId);
    // Eine Bestaetigung ist nur aktuell, wenn sie NACH dem letzten
    // Statuswechsel erfolgte (oder es seither gar keinen weiteren
    // Statuswechsel gab).
    const isStale = ackEntry && transitionEntry && new Date(transitionEntry.createdAt).getTime() > new Date(ackEntry.createdAt).getTime();
    result.set(projectId, isStale ? null : toAcknowledgment(ackEntry));
  }
  return result;
}

export async function buildPriorityQueue(filter: PriorityQueueFilter): Promise<PriorityQueue> {
  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Phase 41's Cache traegt buildResilienceOverview() bereits - EIN Aufruf,
  // keine weitere Datenbankabfrage fuer die Vorselektion.
  const overview = await buildResilienceOverview({ organizationId: filter.organizationId, hours: filter.hours });

  // "UNKNOWN" bewusst ausgeschlossen: ein Projekt ohne Messdaten/Service ist
  // kein Handlungsbedarf, sondern ein Datenluecke - gehoert nicht in eine
  // Prioritaets-Warteschlange fuer operative Entscheidungen.
  const nonHealthy = overview.rows.filter((row) => row.resilienceStatus !== "HEALTHY" && row.resilienceStatus !== "UNKNOWN");

  // Billige Vorsortierung AUSSCHLIESSLICH aus bereits vorhandenen
  // Overview-Feldern (keine zusaetzliche Abfrage) - erst DANACH wird die
  // teure Detailberechnung auf die tatsaechlich zurueckgegebene Menge
  // begrenzt (siehe Skalierbarkeits-Kommentar am Dateikopf).
  const ranked: RankedEntry[] = nonHealthy
    .map((row) => ({ row, score: computePriorityScore(row) }))
    .sort((a, b) => b.score - a.score || a.row.projectId.localeCompare(b.row.projectId))
    .slice(0, limit);

  const acknowledgments = await loadAcknowledgments(ranked.map((r) => r.row.projectId));
  const entries = await Promise.all(ranked.map((r) => buildEntry(r, filter.hours, acknowledgments.get(r.row.projectId) ?? null)));

  return { organizationId: filter.organizationId, windowHours: filter.hours, generatedAt: new Date().toISOString(), entries };
}

// Auftragspunkt "GET Bestaetigungszustand" - Einzel-Projekt-Variante der
// batched Ableitung oben (fuer die dedizierte GET-Route/Detailseite).
export async function getPriorityItemAcknowledgment(projectId: string): Promise<PriorityQueueAcknowledgment | null> {
  const acknowledgments = await loadAcknowledgments([projectId]);
  return acknowledgments.get(projectId) ?? null;
}

export interface AcknowledgePriorityItemInput {
  organizationId: string;
  projectId: string;
  hours: number;
  userId: string;
  note?: string;
  ipAddress?: string;
}

export type AcknowledgePriorityItemResult =
  | { outcome: "NOT_APPLICABLE" }
  | { outcome: "ALREADY_ACKNOWLEDGED"; acknowledgment: PriorityQueueAcknowledgment }
  | { outcome: "ACKNOWLEDGED"; acknowledgment: PriorityQueueAcknowledgment };

// Auftragspunkt 6/7/8 "kontrollierte Aktion, auditierbar, idempotent" - der
// Aufrufer (routes/resilience.routes.ts) traegt bereits RBAC (authorize-
// PlatformOrOrganizationRole) UND Tenant-Isolation (resolveOrgIdForProject)
// vor diesem Aufruf sicher - diese Funktion selbst prueft nur die fachliche
// Vorbedingung (das Projekt muss aktuell tatsaechlich nicht-gesund sein).
export async function acknowledgePriorityItem(input: AcknowledgePriorityItemInput): Promise<AcknowledgePriorityItemResult> {
  const overview = await buildResilienceOverview({ organizationId: input.organizationId, hours: input.hours, projectId: input.projectId });
  const row = overview.rows[0];
  if (!row || row.resilienceStatus === "HEALTHY" || row.resilienceStatus === "UNKNOWN") {
    return { outcome: "NOT_APPLICABLE" };
  }

  // Idempotenz (Auftragspunkt 6 "Idempotency bei Write-Operationen"): ein
  // wiederholter Aufruf, waehrend bereits eine AKTUELLE Bestaetigung
  // existiert, erzeugt KEINEN zweiten Audit-Eintrag, sondern liefert den
  // bestehenden Zustand zurueck - sicher wiederholbar (z.B. bei einem
  // erneuten Klick/Netzwerk-Retry), ohne die etablierte, API-Key-gebundene
  // Idempotency-Key-Infrastruktur (middleware/idempotency.ts, nur fuer
  // /api/v1) hier zu benoetigen, da diese interne, Session-authentifizierte
  // Aktion bereits von sich aus wiederholungssicher ist.
  const existing = await getPriorityItemAcknowledgment(input.projectId);
  if (existing) {
    return { outcome: "ALREADY_ACKNOWLEDGED", acknowledgment: existing };
  }

  const score = computePriorityScore(row);
  const detail = await buildServiceResilienceDetail(input.projectId, input.hours);
  const primarySignal = pickPrimarySignal(detail?.signals ?? []);
  const label = row.serviceName ?? row.projectName;

  // Bewusst createAuditLogEntry() DIREKT statt core/audit-log.ts#recordAuditLog()
  // (das jeden Fehler abfaengt und nur loggt, siehe dortiger Kommentar
  // "ein fehlschlagendes Audit-Log darf NIE die eigentliche Aktion
  // verhindern") - diese Begruendung trifft hier NICHT zu: es gibt keine
  // separate "eigentliche Aktion", der audit_log-Eintrag IST die einzige
  // Persistenz dieser Bestaetigung (siehe Dateikopf-Kommentar "derive,
  // don't store"). Ein verschluckter Fehler wuerde dem Aufrufer faelschlich
  // Erfolg melden, obwohl nichts gespeichert wurde - deshalb hier bewusst
  // EIN Ausnahme von der sonst projektweiten recordAuditLog()-Konvention,
  // mit derselben Realtime-Benachrichtigung (AUDIT_CREATED), die
  // recordAuditLog() intern ebenfalls ausloest.
  const entry = await createAuditLogEntry({
    userId: input.userId,
    action: ACKNOWLEDGED_ACTION,
    category: "SERVICE",
    severity: "INFO",
    projectId: input.projectId,
    message: `${label} priority queue item acknowledged (status ${row.resilienceStatus}, score ${score}).`,
    metadata: {
      organizationId: input.organizationId,
      resilienceStatus: row.resilienceStatus,
      priorityScore: score,
      reasonTitle: primarySignal?.title ?? null,
      note: input.note ?? null,
    },
    ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
  });
  broadcast(createEvent(RealtimeEventType.AUDIT_CREATED, entry));

  return {
    outcome: "ACKNOWLEDGED",
    acknowledgment: {
      acknowledgedBy: input.userId,
      acknowledgedAt: entry.createdAt,
      note: input.note ?? null,
      snapshotResilienceStatus: row.resilienceStatus,
      snapshotPriorityScore: score,
      snapshotReason: primarySignal?.title ?? null,
    },
  };
}
