// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence" - Bestandsanalyse (siehe Architekturentscheidung im
// Abschlussbericht): Phase 44 (core/operational-priority.ts) erzeugt
// Governance-Entscheidungen (Acknowledgments) mit einem Ausgangs-Snapshot,
// wertet aber nie aus, ob die nachfolgende Entwicklung eine tatsaechliche
// Verbesserung war. Alle dafuer noetigen Rohdaten existieren bereits im
// audit_log: PRIORITY_QUEUE_ACKNOWLEDGED (Phase 44) und
// RESILIENCE_STATUS_DEGRADED/RECOVERED (Phase 38, inkl. previousStatus/
// newStatus in metadata). Dieses Modul erzeugt KEINE neue Statusquelle,
// KEINE neue Tabelle - reine Interpretations-/Aggregationsschicht ueber
// bereits geschriebenen Audit-Fakten ("derive, don't store", identisch zum
// Prinzip aus Phase 44).
import { getProjectIdsForOrganization } from "../db/projects.repository";
import { listAuditEntriesForProjectActions } from "../db/audit-log.repository";
import { buildResilienceOverview, RESILIENCE_RANK } from "./service-resilience";
import { ACKNOWLEDGED_ACTION, TRANSITION_ACTIONS } from "./operational-priority";
import type { AuditLogEntry } from "../types/audit.types";
import type { ResilienceStatus } from "../types/resilience.types";
import type {
  AcknowledgmentOutcome,
  AcknowledgmentOutcomeStatus,
  OutcomeIntelligenceProjectSummary,
  OutcomeIntelligenceSummary,
  ProjectAcknowledgmentOutcomeHistory,
  DecisionTimeliness,
  DecisionQuality,
} from "../types/outcome-intelligence.types";

// Auftragspunkt "Messzeitraum" - identisch zum bereits etablierten "7d"
// Default-Range dieser Feature-Kette (RESILIENCE_RANGE_VALUES,
// types/resilience.types.ts; selber Wert ist der UI-Default in Phase 44).
// Ein Rueckfall/eine Verbesserung, die sich erst NACH 7 Tagen zeigt, wird
// bewusst nicht mehr derselben Entscheidung zugerechnet.
export const OUTCOME_MEASUREMENT_WINDOW_HOURS = 24 * 7;

// Auftragspunkt "wiederkehrendes Muster" - identischer Schwellenwert wie
// RECURRING_MIN_COUNT (core/reliability-intelligence.ts, Phase 33) und
// RECURRING_INCIDENT_THRESHOLD (core/service-resilience.ts, Phase 37): drei
// gleichartige Ereignisse gelten in dieser Codebase bereits durchgaengig als
// "kein Zufall mehr" - hier auf REGRESSED+UNRESOLVED-Ausgaenge fuer
// dasselbe Projekt angewendet statt auf Incidents.
const RECURRING_PATTERN_MIN_COUNT = 3;

// Phase 62 "Enterprise Operational Decision Quality" - SCHWELLENWERT-
// DOKUMENTATION (Auftragspunkt "keine beliebigen Zahlen ohne Begruendung"):
// PROMPT (<=30 Min): eine Bestaetigung, die innerhalb einer halben Stunde
//   nach der Verschlechterung erfolgt, gilt als zeitnahe menschliche
//   Reaktion - dieselbe Groessenordnung wie ein typischer erster
//   On-Call-Eskalationsschritt in diesem System.
// DELAYED (30 Min - 4h): noch eine plausible Reaktionszeit innerhalb einer
//   Arbeitsschicht, aber bereits spuerbar verzoegert.
// VERY_DELAYED (>4h): das Problem war laenger unbeachtet, als in einem
//   aktiv betriebenen Enterprise-System als "im Blick behalten" gelten
//   kann.
export const DECISION_LATENCY_PROMPT_MAX_MS = 30 * 60 * 1000;
export const DECISION_LATENCY_DELAYED_MAX_MS = 4 * 60 * 60 * 1000;

function classifyDecisionTimeliness(decisionLatencyMs: number | null): DecisionTimeliness {
  if (decisionLatencyMs === null || decisionLatencyMs < 0) return "UNKNOWN";
  if (decisionLatencyMs <= DECISION_LATENCY_PROMPT_MAX_MS) return "PROMPT";
  if (decisionLatencyMs <= DECISION_LATENCY_DELAYED_MAX_MS) return "DELAYED";
  return "VERY_DELAYED";
}

// Kombiniert Timeliness (vor der Entscheidung) mit dem bereits bestehenden
// outcomeStatus (nach der Entscheidung, Phase 45) zu einem einzigen
// Entscheidungsqualitaets-Urteil - siehe types/outcome-intelligence.types.ts
// fuer die vollstaendige Herleitung der 5 Zustaende.
function classifyDecisionQuality(timeliness: DecisionTimeliness, outcomeStatus: AcknowledgmentOutcomeStatus): DecisionQuality {
  if (timeliness === "UNKNOWN") return "INCONCLUSIVE";
  const effective = outcomeStatus === "RESOLVED" || outcomeStatus === "PARTIALLY_RESOLVED";
  const ineffective = outcomeStatus === "REGRESSED" || outcomeStatus === "UNRESOLVED";
  if (!effective && !ineffective) return "INCONCLUSIVE";
  const prompt = timeliness === "PROMPT" || timeliness === "DELAYED";
  if (prompt) return effective ? "GOOD" : "PROMPT_BUT_INEFFECTIVE";
  return effective ? "LATE_BUT_EFFECTIVE" : "POOR";
}

// Auftragspunkt 22 "N+1 bewusst begrenzen" (Muster aus Phase 36) - deckelt
// nur die seltene Situation eines Projekts mit sehr vielen historischen
// Bestaetigungen im Zeitfenster.
const MAX_ACKNOWLEDGMENTS_PER_PROJECT = 50;

function rankOf(status: ResilienceStatus): number {
  return RESILIENCE_RANK[status];
}

function statusOfTransition(entry: AuditLogEntry): ResilienceStatus | null {
  const value = entry.metadata?.newStatus;
  return typeof value === "string" ? (value as ResilienceStatus) : null;
}

// Kernklassifikation - siehe Architekturentscheidung (Abschlussbericht
// Phase 45, Punkt 7) fuer die vollstaendige Herleitung der 5 Zustaende.
// transitionsInScope: chronologisch AUFSTEIGEND, bereits auf das Fenster
// zwischen dieser Bestaetigung und der naechsten (falls vorhanden) bzw.
// Fensterende begrenzt (siehe buildOutcomesForProject()).
function classify(
  snapshotStatus: ResilienceStatus,
  transitionsInScope: AuditLogEntry[],
  windowElapsed: boolean,
  ackAt: Date,
): { outcomeStatus: AcknowledgmentOutcomeStatus; outcomeReason: string; bestStatusReached: ResilienceStatus; finalStatus: ResilienceStatus; timeToRecoveryMs: number | null } {
  const snapshotRank = rankOf(snapshotStatus);
  const statuses = transitionsInScope.map((t) => ({ entry: t, status: statusOfTransition(t) })).filter((t): t is { entry: AuditLogEntry; status: ResilienceStatus } => t.status !== null);

  const finalStatus: ResilienceStatus = statuses.length > 0 ? statuses[statuses.length - 1]!.status : snapshotStatus;
  const bestStatusReached: ResilienceStatus = statuses.reduce((best, t) => (rankOf(t.status) < rankOf(best) ? t.status : best), snapshotStatus);

  // Rueckfall: irgendwann innerhalb des Fensters eine Verbesserung (Rang
  // gesunken) GEFOLGT von einer spaeteren Verschlechterung (Rang wieder
  // gestiegen) - unabhaengig davon, ob HEALTHY je erreicht wurde.
  let sawImprovement = false;
  let regressedAfterImprovement = false;
  let previousRank = snapshotRank;
  for (const { status } of statuses) {
    const currentRank = rankOf(status);
    if (currentRank < previousRank) sawImprovement = true;
    else if (currentRank > previousRank && sawImprovement) regressedAfterImprovement = true;
    previousRank = currentRank;
  }

  const timeToRecoveryMs = (() => {
    const firstImprovement = statuses.find((t) => rankOf(t.status) < snapshotRank);
    return firstImprovement ? new Date(firstImprovement.entry.createdAt).getTime() - ackAt.getTime() : null;
  })();

  if (regressedAfterImprovement) {
    return {
      outcomeStatus: "REGRESSED",
      outcomeReason: `Status improved after acknowledgment but regressed again within the measurement window (best reached: ${bestStatusReached}, final: ${finalStatus}).`,
      bestStatusReached,
      finalStatus,
      timeToRecoveryMs: null,
    };
  }

  if (finalStatus === "HEALTHY" && windowElapsed) {
    return {
      outcomeStatus: "RESOLVED",
      outcomeReason: "Reached HEALTHY and remained there through the end of the measurement window.",
      bestStatusReached,
      finalStatus,
      timeToRecoveryMs,
    };
  }

  if (rankOf(bestStatusReached) < snapshotRank) {
    if (windowElapsed) {
      return {
        outcomeStatus: "PARTIALLY_RESOLVED",
        outcomeReason: `Improved from ${snapshotStatus} to ${bestStatusReached} but did not reach and hold HEALTHY by the end of the measurement window (final: ${finalStatus}).`,
        bestStatusReached,
        finalStatus,
        timeToRecoveryMs,
      };
    }
    return {
      outcomeStatus: "INSUFFICIENT_DATA",
      outcomeReason: "An improvement was observed, but the measurement window has not yet elapsed - durability cannot be confirmed yet.",
      bestStatusReached,
      finalStatus,
      timeToRecoveryMs,
    };
  }

  if (windowElapsed) {
    return {
      outcomeStatus: "UNRESOLVED",
      outcomeReason: `No improvement observed relative to the acknowledged status (${snapshotStatus}) within the measurement window.`,
      bestStatusReached,
      finalStatus,
      timeToRecoveryMs: null,
    };
  }
  return {
    outcomeStatus: "INSUFFICIENT_DATA",
    outcomeReason: "The measurement window has not yet elapsed and no improvement has been observed yet.",
    bestStatusReached,
    finalStatus,
    timeToRecoveryMs: null,
  };
}

function buildOutcomesForProject(acks: AuditLogEntry[], transitions: AuditLogEntry[], now: Date): AcknowledgmentOutcome[] {
  const limitedAcks = acks.slice(-MAX_ACKNOWLEDGMENTS_PER_PROJECT);
  return limitedAcks.map((ack, index) => {
    const ackAt = new Date(ack.createdAt);
    const windowEnd = new Date(ackAt.getTime() + OUTCOME_MEASUREMENT_WINDOW_HOURS * 60 * 60 * 1000);
    const nextAck = limitedAcks[index + 1];
    const nextAckAt = nextAck ? new Date(nextAck.createdAt) : null;
    // Auftragspunkt "korrekte Zuordnung bei mehreren Bestaetigungen" - eine
    // neue Bestaetigung fuer dasselbe Projekt kann nur nach einem neuen
    // Statuswechsel entstehen (Phase 44's Selbstlösch-Mechanik), daher
    // gehoeren Uebergaenge NACH der naechsten Bestaetigung bereits zu deren
    // eigener Auswertung, nicht mehr zu dieser hier.
    const windowElapsed = (nextAckAt !== null && nextAckAt <= windowEnd) || now >= windowEnd;
    const scopeEnd = nextAckAt !== null && nextAckAt < windowEnd ? nextAckAt : windowEnd;

    const inScope = transitions.filter((t) => {
      const at = new Date(t.createdAt);
      return at > ackAt && at <= scopeEnd && at <= now;
    });

    const snapshotStatus = (typeof ack.metadata?.resilienceStatus === "string" ? ack.metadata.resilienceStatus : "UNKNOWN") as ResilienceStatus;
    const snapshotScore = typeof ack.metadata?.priorityScore === "number" ? ack.metadata.priorityScore : 0;
    const snapshotReason = typeof ack.metadata?.reasonTitle === "string" ? ack.metadata.reasonTitle : null;

    const result = classify(snapshotStatus, inScope, windowElapsed, ackAt);

    // Phase 62 "Enterprise Operational Decision Quality" - "War die
    // Entscheidung zu spaet?": die juengste RESILIENCE_STATUS_DEGRADED-
    // Transition VOR dieser Bestaetigung, aber NACH der vorherigen
    // Bestaetigung (dieselbe Zuordnungs-Logik wie `inScope` oben, nur
    // rueckwaerts) - keine neue Abfrage, `transitions` liegt bereits vor.
    const prevAck = limitedAcks[index - 1];
    const prevAckAt = prevAck ? new Date(prevAck.createdAt) : null;
    const precedingDegradations = transitions.filter((t) => {
      if (t.action !== "RESILIENCE_STATUS_DEGRADED") return false;
      const at = new Date(t.createdAt);
      return at <= ackAt && (prevAckAt === null || at > prevAckAt);
    });
    const triggeringDegradation = precedingDegradations[precedingDegradations.length - 1];
    const decisionLatencyMs = triggeringDegradation ? ackAt.getTime() - new Date(triggeringDegradation.createdAt).getTime() : null;
    const decisionTimeliness = classifyDecisionTimeliness(decisionLatencyMs);
    const decisionQuality = classifyDecisionQuality(decisionTimeliness, result.outcomeStatus);

    return {
      acknowledgedAt: ack.createdAt,
      acknowledgedBy: ack.userId ?? "unknown",
      note: typeof ack.metadata?.note === "string" ? ack.metadata.note : null,
      snapshotResilienceStatus: snapshotStatus,
      snapshotPriorityScore: snapshotScore,
      snapshotReason,
      outcomeStatus: result.outcomeStatus,
      outcomeReason: result.outcomeReason,
      bestStatusReached: result.bestStatusReached,
      finalStatus: result.finalStatus,
      transitionCount: inScope.length,
      timeToRecoveryMs: result.timeToRecoveryMs,
      measurementWindowHours: OUTCOME_MEASUREMENT_WINDOW_HOURS,
      windowElapsed,
      decisionLatencyMs,
      decisionTimeliness,
      decisionQuality,
      evaluatedAt: now.toISOString(),
    };
  });
}

function groupByProject(entries: AuditLogEntry[]): Map<string, AuditLogEntry[]> {
  const map = new Map<string, AuditLogEntry[]>();
  for (const entry of entries) {
    if (!entry.projectId) continue;
    const list = map.get(entry.projectId) ?? [];
    list.push(entry);
    map.set(entry.projectId, list);
  }
  return map;
}

async function loadRawHistory(projectIds: string[], hours: number): Promise<{ acksByProject: Map<string, AuditLogEntry[]>; transitionsByProject: Map<string, AuditLogEntry[]> }> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const [ackEntries, transitionEntries] = await Promise.all([
    listAuditEntriesForProjectActions(projectIds, [ACKNOWLEDGED_ACTION], since),
    listAuditEntriesForProjectActions(projectIds, TRANSITION_ACTIONS, since),
  ]);
  return { acksByProject: groupByProject(ackEntries), transitionsByProject: groupByProject(transitionEntries) };
}

export async function getProjectAcknowledgmentOutcomeHistory(projectId: string, organizationId: string, hours: number): Promise<ProjectAcknowledgmentOutcomeHistory> {
  const { acksByProject, transitionsByProject } = await loadRawHistory([projectId], hours);
  const acks = acksByProject.get(projectId) ?? [];
  const transitions = transitionsByProject.get(projectId) ?? [];
  const outcomes = buildOutcomesForProject(acks, transitions, new Date()).reverse();

  const overview = await buildResilienceOverview({ organizationId, hours, projectId });
  const projectName = overview.rows[0]?.projectName ?? projectId;

  return { projectId, projectName, outcomes };
}

function summarizeProject(projectId: string, projectName: string, outcomes: AcknowledgmentOutcome[]): OutcomeIntelligenceProjectSummary {
  const countOf = (status: AcknowledgmentOutcomeStatus) => outcomes.filter((o) => o.outcomeStatus === status).length;
  const regressedOrUnresolved = countOf("REGRESSED") + countOf("UNRESOLVED");
  return {
    projectId,
    projectName,
    totalAcknowledgments: outcomes.length,
    resolvedCount: countOf("RESOLVED"),
    partiallyResolvedCount: countOf("PARTIALLY_RESOLVED"),
    regressedCount: countOf("REGRESSED"),
    unresolvedCount: countOf("UNRESOLVED"),
    insufficientDataCount: countOf("INSUFFICIENT_DATA"),
    isRecurringPattern: regressedOrUnresolved >= RECURRING_PATTERN_MIN_COUNT,
  };
}

// restrictToProjectIds: v1-API-Keys sind optional auf ein Team beschraenkt
// (routes/v1/resilience.routes.ts#filterRowsForTeam-Muster) - fuer eine
// Aggregation (im Gegensatz zu einer einfachen Zeilenliste) muss diese
// Einschraenkung VOR der Berechnung angewendet werden, nicht danach, sonst
// waeren die Summen falsch.
export async function getOutcomeIntelligenceSummary(organizationId: string, hours: number, restrictToProjectIds?: string[]): Promise<OutcomeIntelligenceSummary> {
  const orgProjectIds = await getProjectIdsForOrganization(organizationId);
  const projectIds = restrictToProjectIds ? orgProjectIds.filter((id) => restrictToProjectIds.includes(id)) : orgProjectIds;
  const now = new Date();
  const { acksByProject, transitionsByProject } = await loadRawHistory(projectIds, hours);

  const overview = await buildResilienceOverview({ organizationId, hours });
  const nameById = new Map(overview.rows.map((row) => [row.projectId, row.projectName]));

  const projects: OutcomeIntelligenceProjectSummary[] = [];
  const counts: Record<AcknowledgmentOutcomeStatus, number> = { RESOLVED: 0, PARTIALLY_RESOLVED: 0, REGRESSED: 0, UNRESOLVED: 0, INSUFFICIENT_DATA: 0 };
  // Phase 62 "Enterprise Operational Decision Quality".
  const decisionQualityCounts: Record<DecisionQuality, number> = { GOOD: 0, LATE_BUT_EFFECTIVE: 0, PROMPT_BUT_INEFFECTIVE: 0, POOR: 0, INCONCLUSIVE: 0 };
  let totalAcknowledgments = 0;
  let recoveryDurationSum = 0;
  let recoveryDurationCount = 0;
  let decisionLatencySum = 0;
  let decisionLatencyCount = 0;

  for (const [projectId, acks] of acksByProject) {
    const transitions = transitionsByProject.get(projectId) ?? [];
    const outcomes = buildOutcomesForProject(acks, transitions, now);
    totalAcknowledgments += outcomes.length;
    for (const outcome of outcomes) {
      counts[outcome.outcomeStatus] += 1;
      decisionQualityCounts[outcome.decisionQuality] += 1;
      if (outcome.timeToRecoveryMs !== null) {
        recoveryDurationSum += outcome.timeToRecoveryMs;
        recoveryDurationCount += 1;
      }
      if (outcome.decisionLatencyMs !== null) {
        decisionLatencySum += outcome.decisionLatencyMs;
        decisionLatencyCount += 1;
      }
    }
    projects.push(summarizeProject(projectId, nameById.get(projectId) ?? projectId, outcomes));
  }

  const evaluatedAcknowledgments = counts.RESOLVED + counts.PARTIALLY_RESOLVED + counts.REGRESSED + counts.UNRESOLVED;
  const resolutionRatePercent = evaluatedAcknowledgments > 0 ? Number(((counts.RESOLVED / evaluatedAcknowledgments) * 100).toFixed(1)) : null;
  const avgTimeToRecoveryMs = recoveryDurationCount > 0 ? Math.round(recoveryDurationSum / recoveryDurationCount) : null;
  const avgDecisionLatencyMs = decisionLatencyCount > 0 ? Math.round(decisionLatencySum / decisionLatencyCount) : null;

  projects.sort((a, b) => b.totalAcknowledgments - a.totalAcknowledgments || a.projectId.localeCompare(b.projectId));
  const recurringProjects = projects.filter((p) => p.isRecurringPattern);

  return {
    organizationId,
    windowHours: hours,
    generatedAt: now.toISOString(),
    totalAcknowledgments,
    evaluatedAcknowledgments,
    counts,
    resolutionRatePercent,
    avgTimeToRecoveryMs,
    avgDecisionLatencyMs,
    decisionQualityCounts,
    recurringProjects,
    projects,
  };
}
