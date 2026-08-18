// Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence" -
// reine Kompositions-/Auswertungsschicht. JEDES Signal stammt aus einer
// bereits bestehenden Engine/Repository-Funktion:
//   - Change-Basisdaten/Ausfuehrungszeit: Phase 28 (db/changes.repository.ts)
//   - Change Risk: Phase 29 (core/change-risk.ts#analyzeChangeRisk) -
//     EINMAL pro analysiertem Change aufgerufen (aktuelles Risikoprofil,
//     keine historische Momentaufnahme - es gibt keine gespeicherte
//     Risk-Snapshot-Tabelle, siehe Bestandsanalyse), NIEMALS pro
//     historischer Incident-Kombination.
//   - Problem/Incident/Change-Verknuepfungen: Phase 35 (db/problems.repository.ts)
//   - SLO-Zustand: Phase 34 (db/slo.repository.ts) UNVERAENDERT wiederverwendet.
// Neu (Phase 36, nur die tatsaechlich fehlende Vorher/Nachher-Aggregation):
// db/remediation-effectiveness.repository.ts.
//
// ---------------------------------------------------------------------------
// SCHWELLENWERT-DOKUMENTATION (Auftragspunkt 6 "keine beliebigen Zahlen ohne
// Begruendung"):
//
// INCIDENT_RATE:   >=30% relative Aenderung der Incidents/Tag gilt als
//                  bedeutsam (kleine Stichproben schwanken leicht um +/-10-20%
//                  allein durch Zufall; 30% ist die in dieser Codebase bereits
//                  etablierte Burn-Rate-Warnschwelle-Groessenordnung, siehe
//                  config/slo.config.ts BURN_RATE_WARNING_MULTIPLIER=2 als
//                  Vergleichsmassstab fuer "deutlich").
// CRITICAL_COUNT:  JEDE Aenderung zaehlt (CRITICAL-Incidents sind ein
//                  seltenes, hochsignifikantes Ereignis - anders als bei der
//                  Rate gibt es hier keine "Rauschen"-Toleranz noetig).
// MTTR:            >=30% relative Aenderung (gleiche Begruendung wie
//                  Incident-Rate; MTTR ist zusaetzlich empfindlich gegenueber
//                  kleinen Stichproben, daher wird die Metrik komplett
//                  uebersprungen, wenn vorher ODER nachher kein einziger
//                  geloester Incident vorliegt - kein Wert ist besser als ein
//                  irrefuehrender).
// SLO_STATUS:      Nutzt den bereits bestehenden 3-Stufen-Status
//                  (HEALTHY/DEGRADED/CRITICAL, core/error-budget.ts
//                  #deriveSloStatus) direkt als Rangfolge - keine neue,
//                  zweite Schwelle erfunden.
// BURN_RATE:       Verbesserung: Burn Rate nachher <= 50% der Burn Rate
//                  vorher. Verschlechterung: >= 150%. Symmetrisch um den
//                  Faktor 1.0 (= "verbraucht das Budget in genau der
//                  zulaessigen Rate", die bestehende Referenzgroesse aus
//                  core/error-budget.ts), 50%/150% ist dieselbe
//                  Groessenordnung wie die Incident-Rate/MTTR-Schwelle oben.
//
// Kombinationslogik (Auftragspunkt 17 "Contradictory Evidence"):
//   improvedSignals>0 UND regressedSignals>0  -> INCONCLUSIVE
//   regressedSignals>0 (und improved=0)        -> REGRESSED
//   improvedSignals>0 (und regressed=0)        -> IMPROVED
//     (zusaetzlich STRONGLY_IMPROVED, wenn vorher>=3 Incidents UND danach
//      buchstaeblich 0 UND keinerlei Regressions-Signal)
//   beides 0                                   -> NO_CHANGE
// ---------------------------------------------------------------------------
import { getChangeById, listServiceIdsForChange } from "../db/changes.repository";
import { analyzeChangeRisk } from "./change-risk";
import { getProblemById, isChangeLinkedToProblem, listRelatedChanges, listRelatedIncidents } from "../db/problems.repository";
import { getIncidentBeforeAfterForChecks, getSloBeforeAfter } from "../db/remediation-effectiveness.repository";
import { listSlos } from "../db/slo.repository";
import type {
  ChangeEffectiveness,
  ChangeRiskSummary,
  EffectivenessStatus,
  EvidenceItem,
  EvidenceStrength,
  IncidentComparison,
  ProblemEffectiveness,
  SloComparisonEntry,
} from "../types/remediation-effectiveness.types";

const INCIDENT_RATE_THRESHOLD = 0.3;
const MTTR_THRESHOLD = 0.3;
const BURN_RATE_IMPROVE_FACTOR = 0.5;
const BURN_RATE_REGRESS_FACTOR = 1.5;
const STRONG_IMPROVEMENT_MIN_BEFORE_COUNT = 3;
// Auftragspunkt 22 "N+1" - "bewusst begrenzen" statt einer komplexen
// Cross-Change-Batch-Abfrage ueber unterschiedliche Vorher/Nachher-Fenster
// pro Change (jeder Change hat einen eigenen Ausfuehrungszeitpunkt). Jede
// einzelne Change-Analyse bleibt bei einer festen, kleinen Anzahl Abfragen
// unabhaengig von der Incident-/SLO-Menge; diese Grenze deckelt nur die
// SELTENE Situation eines Problems mit sehr vielen verknuepften Changes.
const MAX_CHANGES_PER_PROBLEM_ANALYSIS = 20;

const SLO_STATUS_RANK: Record<string, number> = { HEALTHY: 0, DEGRADED: 1, CRITICAL: 2 };

function relativeChange(before: number, after: number): number | null {
  if (before === 0) return after === 0 ? 0 : null; // null = nicht sinnvoll relativ ausdrueckbar
  return (after - before) / before;
}

export async function getProblemEffectiveness(problemId: number, windowDays = 14): Promise<ProblemEffectiveness | undefined> {
  const problem = await getProblemById(problemId);
  if (!problem) return undefined;

  const relatedChanges = (await listRelatedChanges(problemId)).slice(0, MAX_CHANGES_PER_PROBLEM_ANALYSIS);
  const changes: ChangeEffectiveness[] = [];
  for (const relatedChange of relatedChanges) {
    changes.push(await buildChangeEffectiveness(problemId, relatedChange.id, windowDays));
  }

  return { problemId: problem.id, problemStatus: problem.status, changes };
}

export async function getSingleChangeEffectiveness(problemId: number, changeId: number, windowDays = 14): Promise<ChangeEffectiveness | undefined | "NOT_LINKED"> {
  const problem = await getProblemById(problemId);
  if (!problem) return undefined;
  const linked = await isChangeLinkedToProblem(problemId, changeId);
  if (!linked) return "NOT_LINKED";
  return buildChangeEffectiveness(problemId, changeId, windowDays);
}

async function buildChangeEffectiveness(problemId: number, changeId: number, windowDays: number): Promise<ChangeEffectiveness> {
  const change = await getChangeById(changeId);
  const base = {
    changeId,
    changeTitle: change?.title ?? "Unknown change",
    changeStatus: change?.status ?? "UNKNOWN",
    windowDays,
    sloComparison: [] as SloComparisonEntry[],
    evidence: [] as EvidenceItem[],
    risk: null as ChangeRiskSummary | null,
    recommendation: null as string | null,
  };

  if (!change) {
    return { ...base, executionTimestamp: null, beforeWindow: null, afterWindow: null, status: "INSUFFICIENT_DATA", evidenceStrength: "NONE", reasons: ["Change could not be resolved."], incidentComparison: null, recurringPattern: null };
  }

  // Auftragspunkt 7 "Change Execution Time" - NUR tatsaechliche
  // Ausfuehrungsfelder (actual_end_at/actual_start_at) gelten als
  // belastbarer Zeitpunkt. planned_start_at/created_at werden bewusst NICHT
  // als Fallback verwendet - das waere "raten" (Auftrag verbietet das
  // explizit), da ein geplanter/erstellter Zeitpunkt nicht belegt, dass der
  // Change tatsaechlich stattgefunden hat.
  const executionTimestamp = change.actualEndAt ?? change.actualStartAt ?? null;
  if (!executionTimestamp) {
    return {
      ...base,
      executionTimestamp: null,
      beforeWindow: null,
      afterWindow: null,
      status: "INSUFFICIENT_DATA",
      evidenceStrength: "NONE",
      reasons: ["No actual execution timestamp (actualStartAt/actualEndAt) recorded for this change - cannot determine a reliable before/after boundary."],
      incidentComparison: null,
      recurringPattern: null,
    };
  }

  const changeTime = new Date(executionTimestamp);
  const beforeFrom = new Date(changeTime.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const afterTo = new Date(changeTime.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const beforeWindow = { from: beforeFrom.toISOString(), to: changeTime.toISOString() };

  if (new Date() < afterTo) {
    return {
      ...base,
      executionTimestamp,
      beforeWindow,
      afterWindow: { from: changeTime.toISOString(), to: afterTo.toISOString() },
      status: "INSUFFICIENT_DATA",
      evidenceStrength: "NONE",
      reasons: [`After-window incomplete: a full ${windowDays}-day comparison requires the window to have already elapsed.`],
      incidentComparison: null,
      recurringPattern: null,
    };
  }
  const afterWindow = { from: changeTime.toISOString(), to: afterTo.toISOString() };

  // Auftragspunkt 9 "Recurring Incident Comparison" - checkIds kommen aus
  // den BEREITS mit dem Problem verknuepften Incidents (Phase 35), keine
  // neue Mustererkennung.
  const relatedIncidents = await listRelatedIncidents(problemId);
  const checkIds = [...new Set(relatedIncidents.map((i) => i.checkId))];
  const projectIds = [...new Set(relatedIncidents.map((i) => i.projectId))];

  if (checkIds.length === 0) {
    return {
      ...base,
      executionTimestamp,
      beforeWindow,
      afterWindow,
      status: "INSUFFICIENT_DATA",
      evidenceStrength: "NONE",
      reasons: ["No incidents linked to this problem yet - there is no established recurring pattern to compare before/after."],
      incidentComparison: null,
      recurringPattern: null,
    };
  }

  const [incidentBeforeAfter, slos] = await Promise.all([
    getIncidentBeforeAfterForChecks(checkIds, changeTime, windowDays),
    projectIds.length > 0 ? listSlos({ projectIds, enabled: true }) : Promise.resolve([]),
  ]);

  const incidentComparison: IncidentComparison = {
    before: { ...incidentBeforeAfter.before, incidentRatePerDay: Number((incidentBeforeAfter.before.count / windowDays).toFixed(3)) },
    after: { ...incidentBeforeAfter.after, incidentRatePerDay: Number((incidentBeforeAfter.after.count / windowDays).toFixed(3)) },
  };

  const sloBeforeAfterMap = slos.length > 0 ? await getSloBeforeAfter(slos.map((s) => s.id), changeTime, windowDays) : new Map();
  const sloComparison: SloComparisonEntry[] = slos.map((slo) => {
    const entry = sloBeforeAfterMap.get(slo.id);
    return {
      sloId: slo.id,
      sloName: slo.name,
      target: slo.target,
      before: entry?.before ?? { avgSliValue: null, latestSliValue: null, latestStatus: null, avgBurnRate: null, latestBurnRate: null, sampleCount: 0 },
      after: entry?.after ?? { avgSliValue: null, latestSliValue: null, latestStatus: null, avgBurnRate: null, latestBurnRate: null, sampleCount: 0 },
    };
  });

  const evidence: EvidenceItem[] = buildEvidence(incidentComparison, sloComparison);
  const improvedSignals = evidence.filter((e) => e.direction === "IMPROVED").length;
  const regressedSignals = evidence.filter((e) => e.direction === "REGRESSED").length;

  const noPostChangeIncidents = incidentComparison.before.count >= STRONG_IMPROVEMENT_MIN_BEFORE_COUNT && incidentComparison.after.count === 0;

  let status: EffectivenessStatus;
  const reasons: string[] = [];
  if (improvedSignals > 0 && regressedSignals > 0) {
    status = "INCONCLUSIVE";
    reasons.push(`${improvedSignals} metric(s) improved while ${regressedSignals} metric(s) regressed - signals are contradictory, no single confident conclusion can be drawn.`);
  } else if (regressedSignals > 0) {
    status = "REGRESSED";
    reasons.push(`${regressedSignals} metric(s) regressed after the change with no offsetting improvement.`);
  } else if (improvedSignals > 0) {
    if (noPostChangeIncidents && regressedSignals === 0) {
      status = "STRONGLY_IMPROVED";
      reasons.push(`No incidents observed in the ${windowDays}-day period after the change, compared to ${incidentComparison.before.count} before.`);
    } else {
      status = "IMPROVED";
      reasons.push(`${improvedSignals} metric(s) improved with no regressions.`);
    }
  } else {
    status = "NO_CHANGE";
    reasons.push("No metric changed meaningfully before vs. after the change.");
  }

  // Auftragspunkt 12 "Change Risk Integration" - EINMAL pro Change, nicht
  // pro historischer Kombination.
  let risk: ChangeRiskSummary | null = null;
  try {
    const serviceIds = await listServiceIdsForChange(changeId);
    const analysis = await analyzeChangeRisk({ ...change, serviceIds });
    risk = { score: analysis.score, verdict: analysis.verdict, blockerCount: analysis.blockers.length };
  } catch {
    risk = null;
  }

  // Auftragspunkt 15 "Problem Status Suggestion" - NUR eine Empfehlung,
  // NIEMALS eine automatische Statusaenderung.
  const problem = await getProblemById(problemId);
  let recommendation: string | null = null;
  if (problem?.status === "MITIGATED" && change.status === "COMPLETED" && (status === "IMPROVED" || status === "STRONGLY_IMPROVED")) {
    recommendation = "Problem may be ready for RESOLVED review.";
  }

  return {
    ...base,
    executionTimestamp,
    beforeWindow,
    afterWindow,
    status,
    evidenceStrength: deriveEvidenceStrength(status, improvedSignals, regressedSignals),
    reasons,
    incidentComparison,
    recurringPattern: { checkIds, beforeCount: incidentComparison.before.count, afterCount: incidentComparison.after.count },
    sloComparison,
    evidence,
    risk,
    recommendation,
  };
}

function deriveEvidenceStrength(status: EffectivenessStatus, improvedSignals: number, regressedSignals: number): EvidenceStrength {
  if (status === "NOT_EVALUATED" || status === "INSUFFICIENT_DATA") return "NONE";
  if (status === "STRONGLY_IMPROVED") return "STRONG";
  if (status === "NO_CHANGE" || status === "INCONCLUSIVE") return "WEAK";
  const signalCount = Math.max(improvedSignals, regressedSignals);
  return signalCount >= 2 ? "STRONG" : "MODERATE";
}

function buildEvidence(incidentComparison: IncidentComparison, sloComparison: SloComparisonEntry[]): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];
  const { before, after } = incidentComparison;

  // INCIDENT_RATE
  if (before.count === 0 && after.count === 0) {
    // kein Datenpunkt - kein Evidence-Item (weder Verbesserung noch
    // Verschlechterung messbar).
  } else if (before.count === 0 && after.count > 0) {
    evidence.push({
      metric: "INCIDENT_RATE",
      before: before.incidentRatePerDay,
      after: after.incidentRatePerDay,
      delta: after.incidentRatePerDay,
      direction: "REGRESSED",
      interpretation: "New incidents appeared after the change where none occurred in the before-window.",
    });
  } else {
    const rel = relativeChange(before.incidentRatePerDay, after.incidentRatePerDay);
    const direction = rel !== null && rel <= -INCIDENT_RATE_THRESHOLD ? "IMPROVED" : rel !== null && rel >= INCIDENT_RATE_THRESHOLD ? "REGRESSED" : "UNCHANGED";
    evidence.push({
      metric: "INCIDENT_RATE",
      before: before.incidentRatePerDay,
      after: after.incidentRatePerDay,
      delta: rel !== null ? Number((rel * 100).toFixed(1)) : null,
      direction,
      interpretation:
        direction === "IMPROVED"
          ? "Incident rate decreased meaningfully after the change."
          : direction === "REGRESSED"
            ? "Incident rate increased meaningfully after the change."
            : "Incident rate is practically unchanged.",
    });
  }

  // NO_POST_CHANGE_INCIDENTS (zusaetzliches, staerkeres Signal)
  if (before.count >= STRONG_IMPROVEMENT_MIN_BEFORE_COUNT && after.count === 0) {
    evidence.push({
      metric: "NO_POST_CHANGE_INCIDENTS",
      before: before.count,
      after: after.count,
      delta: -before.count,
      direction: "IMPROVED",
      interpretation: `Observed incident recurrence decreased to zero (from ${before.count}) in the after-window.`,
    });
  }

  // CRITICAL_INCIDENTS
  {
    const direction = after.criticalCount < before.criticalCount ? "IMPROVED" : after.criticalCount > before.criticalCount ? "REGRESSED" : "UNCHANGED";
    evidence.push({
      metric: "CRITICAL_INCIDENTS",
      before: before.criticalCount,
      after: after.criticalCount,
      delta: after.criticalCount - before.criticalCount,
      direction,
      interpretation:
        direction === "IMPROVED" ? "Fewer CRITICAL incidents after the change." : direction === "REGRESSED" ? "More CRITICAL incidents after the change." : "CRITICAL incident count unchanged.",
    });
  }

  // MTTR - nur wenn auf beiden Seiten mindestens ein geloester Incident vorliegt
  if (before.avgMttrMs !== null && after.avgMttrMs !== null) {
    const rel = relativeChange(before.avgMttrMs, after.avgMttrMs);
    const direction = rel !== null && rel <= -MTTR_THRESHOLD ? "IMPROVED" : rel !== null && rel >= MTTR_THRESHOLD ? "REGRESSED" : "UNCHANGED";
    evidence.push({
      metric: "MTTR",
      before: before.avgMttrMs,
      after: after.avgMttrMs,
      delta: rel !== null ? Number((rel * 100).toFixed(1)) : null,
      direction,
      interpretation: direction === "IMPROVED" ? "Mean time to resolve decreased meaningfully." : direction === "REGRESSED" ? "Mean time to resolve increased meaningfully." : "MTTR practically unchanged.",
    });
  }

  // SLO_STATUS + ERROR_BUDGET_BURN_RATE (pro betroffener SLO)
  for (const slo of sloComparison) {
    const beforeRank = slo.before.latestStatus !== null ? SLO_STATUS_RANK[slo.before.latestStatus] : undefined;
    const afterRank = slo.after.latestStatus !== null ? SLO_STATUS_RANK[slo.after.latestStatus] : undefined;
    if (beforeRank !== undefined && afterRank !== undefined) {
      const direction = afterRank < beforeRank ? "IMPROVED" : afterRank > beforeRank ? "REGRESSED" : "UNCHANGED";
      evidence.push({
        metric: "SLO_STATUS",
        before: slo.before.latestStatus,
        after: slo.after.latestStatus,
        delta: null,
        direction,
        interpretation: `SLO "${slo.sloName}" status ${direction === "IMPROVED" ? "improved" : direction === "REGRESSED" ? "worsened" : "unchanged"} (${slo.before.latestStatus} -> ${slo.after.latestStatus}).`,
      });
    }

    if (slo.before.avgBurnRate !== null && slo.after.avgBurnRate !== null) {
      const beforeBurn = slo.before.avgBurnRate;
      const afterBurn = slo.after.avgBurnRate;
      let direction: EvidenceItem["direction"] = "UNCHANGED";
      if (beforeBurn <= 0.0001 && afterBurn <= 0.0001) {
        direction = "UNCHANGED";
      } else if (afterBurn <= beforeBurn * BURN_RATE_IMPROVE_FACTOR) {
        direction = "IMPROVED";
      } else if (afterBurn >= beforeBurn * BURN_RATE_REGRESS_FACTOR) {
        direction = "REGRESSED";
      }
      evidence.push({
        metric: "ERROR_BUDGET_BURN_RATE",
        before: Number(beforeBurn.toFixed(3)),
        after: Number(afterBurn.toFixed(3)),
        delta: Number((afterBurn - beforeBurn).toFixed(3)),
        direction,
        interpretation:
          direction === "IMPROVED"
            ? `Error-budget burn rate for "${slo.sloName}" decreased significantly.`
            : direction === "REGRESSED"
              ? `Error-budget burn rate for "${slo.sloName}" increased significantly.`
              : `Error-budget burn rate for "${slo.sloName}" practically unchanged.`,
      });
    }
  }

  return evidence;
}
