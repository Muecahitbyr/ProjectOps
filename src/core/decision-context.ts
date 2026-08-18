// Phase 50 "Enterprise Operational Decision & Executive Intelligence" -
// reine Korrelations-/Synthese-Schicht. KEINE neue Signalquelle, KEINE neue
// Risiko-/Health-/Score-Berechnung:
//   - Health/Reliability/SLO/Probleme/Dependencies/Blast-Radius/Change-Risk/
//     Remediation/Forecast/Signale/Business-Impact: core/service-resilience.ts
//     #buildServiceResilienceDetail() (Phase 37/42/47) - EIN Aufruf, gibt
//     bereits alles davon zurueck.
//   - Bestaetigungsstatus: core/operational-priority.ts
//     #getPriorityItemAcknowledgment() (Phase 44).
//   - Outcome-Historie: core/outcome-intelligence.ts
//     #getProjectAcknowledgmentOutcomeHistory() (Phase 45).
//   - Governance-/Automation-Kontrollen: db/automation-rules.repository.ts
//     #listAutomationRules() (Phase 17/40).
//   - Proactive-Risk-Historie: db/audit-log.repository.ts
//     #listAuditEntriesForProjectActions() (Phase 49, bereits bestehende
//     Funktion, keine neue Repository-Abfrage).
// Bewusst EIN-Service-skaliert (6 leichte Aufrufe) statt des bounded-Top-N-
// Org-weiten Musters von Phase 43/46/47/48 - fuer EINEN konkreten Service
// (der Nutzer hat bereits navigiert) ist das genauer (kein "war nicht unter
// den Top-Kandidaten") UND billiger (kein Sweep ueber alle Projekte).
import { buildServiceResilienceDetail } from "./service-resilience";
import { getPriorityItemAcknowledgment } from "./operational-priority";
import { getProjectAcknowledgmentOutcomeHistory } from "./outcome-intelligence";
import { getAutomationOutcomeTrackRecord } from "./automation-outcome-verification";
import { AGENT_CAPACITY_WARNING_ACTION, AGENT_CAPACITY_RECOVERED_ACTION } from "./local-agent";
import { listAutomationRules } from "../db/automation-rules.repository";
import { listAuditEntriesForProjectActions, listAuditLog } from "../db/audit-log.repository";
import { getServiceByProjectId } from "../db/services.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { getLatestAgentIdForProject } from "../db/monitoring-agents.repository";
import { detectAutomationRuleConflicts } from "./governance-rule-conflicts";
import type { ResilienceSignal, ResilienceSignalType } from "../types/resilience.types";
import type { AutomationOutcomeTrackRecordEntry } from "../types/automation-outcome.types";
import type { AutomationRuleConflict } from "../types/governance.types";
import type {
  DecisionContext,
  DecisionContextAutomationControl,
  Recommendation,
  RecommendationConfidence,
} from "../types/decision-context.types";

const PROACTIVE_RISK_ACTIONS = ["PROACTIVE_RISK_DETECTED", "PROACTIVE_RISK_CLEARED"];
// Dieselbe etablierte "3 gleichartige Ereignisse = kein Zufall"-Groessenordnung
// wie core/outcome-intelligence.ts#RECURRING_PATTERN_MIN_COUNT (Phase 45).
const RECURRING_OUTCOME_FAILURE_THRESHOLD = 3;
const PROACTIVE_RISK_LOOKBACK_DAYS = 30;
// Auftragspunkt "widerspruechliche Zeitraeume vermeiden" (echter Fund
// waehrend des Testens): der aeussere "hours"-Parameter steuert das
// AKTUELLE-Zustand-Fenster (Resilience-Detail, ueblicherweise 24h-7d) - fuer
// wiederkehrende Outcome-Muster (Phase 45) braucht es dagegen absichtlich
// einen LANGEN, vom aktuellen Fenster UNABHAENGIGEN Rueckblick (ein
// Bestaetigungs-Zyklus, der vor 60 Tagen begann, waere sonst faelschlich
// unsichtbar, wenn der Nutzer gerade "24h" fuer den aktuellen Zustand
// gewaehlt hat). Feste 90 Tage - derselbe Maximalwert wie
// RESILIENCE_RANGE_HOURS["90d"] (types/resilience.types.ts), keine neue
// Zeitraum-Konvention erfunden.
const OUTCOME_HISTORY_LOOKBACK_HOURS = 24 * 90;

// Auftragspunkt 8 "keine Empfehlung darf als garantiert richtig dargestellt
// werden" - jede Empfehlung ist eine strukturierte, statische Vorlage ueber
// bereits bestehende Signale, KEIN Freitext/KEINE KI-Formulierung.
const CHANGE_MANAGEMENT_PERMISSION = "OPERATOR, DEVELOPER, ORGANIZATION_ADMIN/OWNER, or PLATFORM_OWNER";

function forecastSignalTypes(): Set<ResilienceSignalType> {
  return new Set(["PROJECTED_DEGRADATION", "PROJECTED_INCIDENT_INCREASE", "PROJECTED_RESPONSE_TIME_DEGRADATION"]);
}

function pickWorstSignal(signals: ResilienceSignal[]): ResilienceSignal | undefined {
  const rank: Record<ResilienceSignal["severity"], number> = { CRITICAL: 2, WARNING: 1, INFO: 0 };
  return [...signals].sort((a, b) => rank[b.severity] - rank[a.severity])[0];
}

// Phase 55 "Enterprise Capacity & Resource Optimization" - verknuepft ein
// AGENT-skaliertes Kapazitaetsrisiko (core/local-agent.ts) mit EINEM
// PROJEKT ueber "welcher Agent hat dieses Projekt zuletzt tatsaechlich
// geprueft" (db/monitoring-agents.repository.ts#getLatestAgentIdForProject(),
// Phase 55) - dieselbe "derive, don't store"-Leitlinie, keine neue
// Zuordnungstabelle. Bounded (limit 200, dieselbe Vorsicht wie jede andere
// listAuditLog()-Nutzung in diesem System, z.B. Phase 53).
export interface ActiveAgentCapacityRisk {
  agentId: string;
  agentName: string;
  metric: string;
  projectedPercent: number | null;
  recommendedAction: string | null;
}

// Phase 58 "Enterprise Operational Risk Correlation" - exportiert (reine
// Sichtbarkeits-Aenderung, keine Verhaltensaenderung), damit
// core/risk-correlation.ts dieselbe, bereits bestehende Ableitung
// wiederverwenden kann statt sie ein zweites Mal zu implementieren.
export async function getActiveAgentCapacityRisk(projectId: string): Promise<ActiveAgentCapacityRisk | null> {
  const agentId = await getLatestAgentIdForProject(projectId);
  if (!agentId) return null;

  const entries = await listAuditLog({ category: "SYSTEM", limit: 200 });
  const relevant = entries.filter(
    (e) => (e.action === AGENT_CAPACITY_WARNING_ACTION || e.action === AGENT_CAPACITY_RECOVERED_ACTION) && e.metadata?.agentId === agentId,
  );
  const sorted = [...relevant].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const latest = sorted[sorted.length - 1];
  if (!latest || latest.action !== AGENT_CAPACITY_WARNING_ACTION) return null;

  return {
    agentId,
    agentName: typeof latest.metadata?.agentName === "string" ? latest.metadata.agentName : agentId,
    metric: typeof latest.metadata?.metric === "string" ? latest.metadata.metric : "UNKNOWN",
    projectedPercent: typeof latest.metadata?.projectedPercent === "number" ? latest.metadata.projectedPercent : null,
    recommendedAction: typeof latest.metadata?.recommendedAction === "string" ? latest.metadata.recommendedAction : null,
  };
}

export async function buildDecisionContext(projectId: string, hours: number): Promise<DecisionContext | undefined> {
  const organizationId = await getProjectOrganizationId(projectId);
  if (!organizationId) return undefined;

  const since = new Date(Date.now() - PROACTIVE_RISK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [detail, acknowledgment, outcomeHistory, automationRules, proactiveRiskEntries, service, automationTrackRecord, agentCapacityRisk, automationRuleConflicts] = await Promise.all([
    buildServiceResilienceDetail(projectId, hours),
    getPriorityItemAcknowledgment(projectId),
    getProjectAcknowledgmentOutcomeHistory(projectId, organizationId, OUTCOME_HISTORY_LOOKBACK_HOURS),
    listAutomationRules({ projectId }),
    listAuditEntriesForProjectActions([projectId], PROACTIVE_RISK_ACTIONS, since),
    getServiceByProjectId(projectId),
    getAutomationOutcomeTrackRecord(projectId),
    getActiveAgentCapacityRisk(projectId),
    detectAutomationRuleConflicts(projectId),
  ]);

  if (!detail) return undefined;

  const automationControls: DecisionContextAutomationControl[] = automationRules.map((rule) => ({
    ruleId: rule.id,
    name: rule.name,
    trigger: rule.trigger,
    enabled: rule.enabled,
    autoExecute: rule.autoExecute,
    approvalRequired: rule.approvalRequired,
  }));

  // Proactive Risk: der juengste Eintrag (chronologisch letzter) bestimmt,
  // ob aktuell ein aktives Signal besteht (DETECTED ohne nachfolgendes
  // CLEARED) - dieselbe "juengster Eintrag gewinnt"-Logik wie Phase 44's
  // Bestaetigungsstatus.
  const sortedProactiveEntries = [...proactiveRiskEntries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const latestProactive = sortedProactiveEntries[sortedProactiveEntries.length - 1];
  const proactiveRisk = {
    active: latestProactive?.action === "PROACTIVE_RISK_DETECTED",
    detectedAt: latestProactive?.action === "PROACTIVE_RISK_DETECTED" ? latestProactive.createdAt : null,
    signalTitles: latestProactive?.action === "PROACTIVE_RISK_DETECTED" && Array.isArray(latestProactive.metadata?.signalTitles) ? (latestProactive.metadata!.signalTitles as string[]) : [],
  };

  const recommendations = buildRecommendations({ projectId, detail, acknowledgment, outcomeHistory, automationControls, proactiveRisk, automationTrackRecord, agentCapacityRisk, automationRuleConflicts });

  return {
    projectId,
    projectName: detail.projectName,
    serviceId: detail.serviceId,
    serviceName: detail.serviceName,
    lifecycleStatus: service?.lifecycleStatus ?? null,
    businessOwner: service?.businessOwner ?? null,
    generatedAt: new Date().toISOString(),
    windowHours: hours,
    detail,
    acknowledgment,
    outcomeHistory,
    automationControls,
    proactiveRisk,
    automationTrackRecord,
    agentCapacityRisk,
    automationRuleConflicts,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// EMPFEHLUNGS-REGELN (Auftragspunkt 5/6 "Phase 50 selbst ableiten" +
// Auftragspunkt 8 "Recommendations") - 5 deterministische, dokumentierte
// Regeln ueber bereits vorhandene Signale. Jede Regel feuert NUR, wenn ihre
// Vorbedingung durch tatsaechliche Daten erfuellt ist (Auftragspunkt "Kein
// akutes Problem -> keine unnoetige Empfehlung").
// ---------------------------------------------------------------------------
function buildRecommendations(input: {
  projectId: string;
  detail: NonNullable<Awaited<ReturnType<typeof buildServiceResilienceDetail>>>;
  acknowledgment: Awaited<ReturnType<typeof getPriorityItemAcknowledgment>>;
  outcomeHistory: Awaited<ReturnType<typeof getProjectAcknowledgmentOutcomeHistory>>;
  automationControls: DecisionContextAutomationControl[];
  proactiveRisk: { active: boolean; detectedAt: string | null; signalTitles: string[] };
  automationTrackRecord: AutomationOutcomeTrackRecordEntry[];
  agentCapacityRisk: ActiveAgentCapacityRisk | null;
  automationRuleConflicts: AutomationRuleConflict[];
}): Recommendation[] {
  const { projectId, detail, acknowledgment, outcomeHistory, automationControls, proactiveRisk, automationTrackRecord, agentCapacityRisk, automationRuleConflicts } = input;
  const recommendations: Recommendation[] = [];
  const isActiveTechnicalIssue = detail.resilienceStatus === "CRITICAL" || detail.resilienceStatus === "AT_RISK";

  // R1 - unbestaetigtes aktives Problem.
  if (isActiveTechnicalIssue && !acknowledgment) {
    const worstSignal = pickWorstSignal(detail.signals);
    const resolvedPast = outcomeHistory.outcomes.filter((o) => o.outcomeStatus === "RESOLVED").length;
    const evaluatedPast = outcomeHistory.outcomes.filter((o) => o.outcomeStatus === "RESOLVED" || o.outcomeStatus === "PARTIALLY_RESOLVED" || o.outcomeStatus === "REGRESSED" || o.outcomeStatus === "UNRESOLVED").length;
    // Phase 62 "Enterprise Operational Decision Quality" - "Kann diese
    // Bewertung fuer zukuenftige Decisions verwendet werden?": nutzt die
    // bereits berechnete decisionTimeliness (Phase 62, core/outcome-
    // intelligence.ts) dieses Projekts, um eine wiederkehrend VERSPAETETE
    // Reaktion sichtbar zu machen, BEVOR die aktuelle Entscheidung
    // getroffen wird - keine neue Berechnung, nur eine Textanreicherung
    // bereits vorhandener Daten.
    const lateDecisions = outcomeHistory.outcomes.filter((o) => o.decisionTimeliness === "VERY_DELAYED").length;
    const timelinessNote =
      lateDecisions >= 2
        ? ` Note: ${lateDecisions} of the last ${outcomeHistory.outcomes.length} acknowledgments for this service came more than 4 hours after the underlying issue first appeared - consider acting sooner this time.`
        : "";
    recommendations.push({
      kind: "UNACKNOWLEDGED_ACTIVE_ISSUE",
      problem: `Service is currently ${detail.resilienceStatus} and has not been acknowledged yet.`,
      relevantSignals: worstSignal ? [worstSignal.title] : [`Resilience status: ${detail.resilienceStatus}`],
      recommendedAction: "Acknowledge this in the Priority Queue to confirm it is being worked on.",
      reasoning: worstSignal ? worstSignal.explanation : "The service's current technical state indicates an active, unaddressed issue.",
      expectedEffect: evaluatedPast > 0 ? `${resolvedPast} of ${evaluatedPast} past acknowledgments for this service led to durable resolution.` : "No historical acknowledgment outcome data exists yet for this service.",
      risks: `Acknowledging does not fix the underlying issue by itself - it only records that a human is aware and responding.${timelinessNote}`,
      confidence: "HIGH",
      requiredPermission: CHANGE_MANAGEMENT_PERMISSION,
      requiresApproval: false,
      alternative: "Escalate directly via incident communication tools instead of acknowledging first.",
      actionRef: { method: "POST", path: `/api/resilience/services/${projectId}/acknowledge`, label: "Acknowledge priority item" },
    });
  }

  // R2 - riskanter Change waehrend eines aktiven Vorfalls.
  const riskyChange = detail.activeChangeRisks.find((c) => c.verdict === "WARNING" || c.verdict === "BLOCKED");
  if (riskyChange && (isActiveTechnicalIssue || detail.health.openIncidents > 0)) {
    recommendations.push({
      kind: "HIGH_RISK_CHANGE_DURING_INCIDENT",
      problem: `Change "${riskyChange.title}" has a ${riskyChange.verdict} risk verdict while this service shows active issues.`,
      relevantSignals: [`Change risk score: ${riskyChange.score}`, `Open incidents: ${detail.health.openIncidents}`],
      recommendedAction: riskyChange.verdict === "BLOCKED" ? "This change is already blocked by governance - do not override without review." : "Review the change's risk assessment before it proceeds; consider delaying it.",
      reasoning: "A risky change proceeding during an active issue increases the chance of compounding the problem or misattributing its root cause.",
      expectedEffect: "Delaying or reviewing a risky change during an active issue is a standard change-management safeguard already enforced elsewhere in this platform.",
      risks: "Delaying a change may itself have business consequences (missed deadlines, blocked dependent work).",
      confidence: "HIGH",
      requiredPermission: CHANGE_MANAGEMENT_PERMISSION,
      requiresApproval: riskyChange.verdict === "BLOCKED",
      alternative: "Proceed with the change but increase monitoring/rollback readiness.",
      actionRef: { method: "GET", path: `/api/changes/${riskyChange.changeId}/risk`, label: "Review change risk detail" },
    });
  }

  // R3 - wiederkehrendes Outcome-Versagen (Bestaetigungen halten nicht).
  const strugglingOutcomes = outcomeHistory.outcomes.filter((o) => o.outcomeStatus === "REGRESSED" || o.outcomeStatus === "UNRESOLVED").length;
  if (strugglingOutcomes >= RECURRING_OUTCOME_FAILURE_THRESHOLD) {
    recommendations.push({
      kind: "RECURRING_OUTCOME_FAILURE",
      problem: `${strugglingOutcomes} past acknowledgments for this service did not lead to a durable resolution.`,
      relevantSignals: outcomeHistory.outcomes.slice(0, 3).map((o) => `${o.acknowledgedAt}: ${o.outcomeStatus}`),
      recommendedAction: "Consider escalating this to a formal Problem record for structural root-cause investigation, instead of repeatedly acknowledging the same recurrence.",
      reasoning: "Repeated acknowledgment without durable resolution is a documented pattern of a structural (not transient) issue.",
      expectedEffect: "Problem Management tracks root-cause analysis and links remediation changes with their own effectiveness evaluation.",
      risks: "Opening a Problem record adds process overhead if the recurrence is actually unrelated incidents rather than one root cause.",
      confidence: "MEDIUM",
      requiredPermission: CHANGE_MANAGEMENT_PERMISSION,
      requiresApproval: false,
      alternative: "Continue monitoring via the Priority Queue without escalating.",
      actionRef: { method: "GET", path: "/api/problems", label: "Open Problem Management" },
    });
  }

  // R4 - aktives Proactive-Risk-Signal (noch gesund, aber Forecast warnt).
  // Phase 54 "Enterprise Predictive Operations & Risk Prevention" -
  // Abhaengigkeits-/Change-Risiko-Kontext ergaenzt (beide bereits Teil von
  // `detail`, keine zusaetzliche Abfrage): eine degradierende Prognose auf
  // einem SPOF/grossen Blast-Radius bzw. waehrend ein riskanter Change
  // laeuft ist dringlicher als dieselbe Prognose auf einem isolierten
  // Service - Confidence bleibt bewusst MEDIUM (beschreibt weiterhin nur
  // die Unsicherheit der Forecast-Quelle selbst, siehe Phase 50-Kommentar,
  // nicht die Dringlichkeit - diese Trennung bleibt unveraendert).
  if (proactiveRisk.active) {
    const dependencyNote = detail.isPotentialSpof
      ? `This service is a potential single point of failure (${detail.blastRadius?.affectedServiceCount ?? 0} service(s) would be affected).`
      : (detail.blastRadius?.affectedServiceCount ?? 0) > 0
        ? `A failure here would affect ${detail.blastRadius!.affectedServiceCount} dependent service(s).`
        : null;
    const changeRiskNote = riskyChange ? `An active change ("${riskyChange.title}") currently has a ${riskyChange.verdict} risk verdict on this service.` : null;

    recommendations.push({
      kind: "PROACTIVE_RISK_ACTIVE",
      problem: [
        "This service is currently healthy but shows a degrading forecast trend flagged by proactive risk monitoring.",
        dependencyNote,
        changeRiskNote,
      ].filter((s): s is string => Boolean(s)).join(" "),
      relevantSignals: proactiveRisk.signalTitles,
      recommendedAction: "Investigate proactively before this becomes a real incident.",
      reasoning: "A 30-day statistical trend (not yet a current failure) indicates the situation may worsen if left unaddressed.",
      expectedEffect: "Forecast-based warnings have a measurable historical accuracy rate (see Forecast Accuracy) - this is not a certainty.",
      risks: [
        "The trend may resolve on its own; investigating has a real time cost.",
        dependencyNote ? "Because of this service's dependency exposure, a real degradation here would have an outsized downstream impact." : null,
        changeRiskNote ? "Proceeding with the active risky change while this trend is unresolved compounds the risk." : null,
      ].filter((s): s is string => Boolean(s)).join(" "),
      confidence: "MEDIUM",
      requiredPermission: "Any organization member (read-only investigation)",
      requiresApproval: false,
      alternative: "Wait and monitor via the Capacity Watchlist without investigating now.",
      actionRef: null,
    });
  }

  // R5 - Forecast-Signal ohne konfigurierte Automation.
  // Phase 53 "Enterprise Operational Learning & Optimization" - schliesst
  // die Feedback-Luecke: bevor mehr Automation empfohlen wird, wird geprueft,
  // ob Automation fuer GENAU diese Trigger in DIESEM Projekt historisch
  // tatsaechlich half (getAutomationOutcomeTrackRecord(), Phase 51/52-Daten).
  const hasForecastSignal = detail.signals.some((s) => forecastSignalTypes().has(s.type));
  const hasRelevantAutomation = automationControls.some((c) => c.enabled && (c.trigger === "PROACTIVE_RISK_DETECTED" || c.trigger === "RESILIENCE_DEGRADED"));
  if (hasForecastSignal && !hasRelevantAutomation) {
    const relevantTrackRecords = automationTrackRecord.filter((t) => t.trigger === "PROACTIVE_RISK_DETECTED" || t.trigger === "RESILIENCE_DEGRADED");
    const ineffective = relevantTrackRecords.find((t) => t.classification === "INEFFECTIVE");
    const effective = relevantTrackRecords.find((t) => t.classification === "EFFECTIVE");

    const reasoning = ineffective
      ? `Automation templates for both triggers already exist, but this project's own history shows "${ineffective.actionType}" automation for this trigger rarely led to a durable improvement (${ineffective.durableImprovedCount} of ${ineffective.totalVerified} verified outcomes). Review the automation's design before enabling more of the same kind.`
      : effective
        ? `Automation templates for both triggers already exist, and this project's own history shows "${effective.actionType}" automation for this trigger reliably led to a durable improvement (${effective.durableImprovedCount} of ${effective.totalVerified} verified outcomes).`
        : "Automation templates for both triggers already exist in this platform and only need to be enabled per project.";
    const expectedEffect = ineffective
      ? "Based on this project's own automation outcome history, simply enabling more automation of the same kind for this trigger may not durably help - the underlying automation itself may need review."
      : effective
        ? "This project's own automation outcome history supports faster, durable resolution the next time this signal recurs."
        : "Faster, consistent diagnostic capture the next time this signal recurs.";
    const risks = ineffective
      ? "This project's history shows this exact kind of automation for this trigger has a poor durable-improvement track record - enabling it again without changes risks repeating the same non-improvement."
      : "Automation rules can misfire if conditions are too broad - start with approvalRequired=true.";

    recommendations.push({
      kind: "FORECAST_SIGNAL_NO_AUTOMATION",
      problem: "A degrading forecast signal exists for this service, but no automation rule is configured to react to it.",
      relevantSignals: detail.signals.filter((s) => forecastSignalTypes().has(s.type)).map((s) => s.title),
      recommendedAction: "Consider configuring an automation rule (e.g. diagnostic snapshot) for PROACTIVE_RISK_DETECTED or RESILIENCE_DEGRADED on this project.",
      reasoning,
      expectedEffect,
      risks,
      confidence: effective ? "MEDIUM" : "LOW",
      requiredPermission: CHANGE_MANAGEMENT_PERMISSION,
      requiresApproval: false,
      alternative: "Continue relying on manual investigation.",
      actionRef: { method: "GET", path: "/api/automation-rules", label: "Configure automation rules" },
    });
  }

  // R6 - Agent-Kapazitaetsrisiko beeintraechtigt die Ueberwachung DIESES
  // Projekts. Phase 55 "Enterprise Capacity & Resource Optimization" -
  // anders als R1-R5 (alle projekt-eigene Signale) beschreibt dieser Fall
  // ein Risiko an der INFRASTRUKTUR, die das Projekt ueberwacht - HIGH
  // Confidence, da es sich (anders als ein Forecast-Signal) bereits um
  // einen tatsaechlich ueberschrittenen Schwellenwert handelt, nicht um
  // eine Prognose-Unsicherheit.
  if (agentCapacityRisk) {
    recommendations.push({
      kind: "AGENT_CAPACITY_RISK_AFFECTING_MONITORING",
      problem: `The monitoring agent ("${agentCapacityRisk.agentName}") that runs checks for this project is projected to reach ${agentCapacityRisk.projectedPercent !== null ? Math.round(agentCapacityRisk.projectedPercent) : "an at-risk"}% of its ${agentCapacityRisk.metric === "DISK_USAGE" ? "disk" : "memory"} capacity.`,
      relevantSignals: [`Agent capacity risk: ${agentCapacityRisk.metric}`],
      recommendedAction: agentCapacityRisk.recommendedAction ?? "Investigate the monitoring agent's resource usage before capacity is exhausted.",
      reasoning: "If the agent that executes this project's checks runs out of capacity, monitoring for this (and potentially other) projects could silently degrade or stop.",
      expectedEffect: "Freeing up capacity on the agent restores reliable monitoring coverage for every project it serves, not just this one.",
      risks: "This is an infrastructure-level risk, not specific to this project alone - other projects monitored by the same agent are equally affected.",
      confidence: "HIGH",
      requiredPermission: "PLATFORM_OWNER (infrastructure access)",
      requiresApproval: false,
      alternative: "Monitor the agent's capacity forecast directly via the Diagnostics Center without acting now.",
      actionRef: null,
    });
  }

  // R7 - widerspruechliche/ueberfluessige Governance-Regeln (Automation).
  // Phase 61 "Enterprise Operational Governance Optimization" - anders als
  // R1-R6 (alle ueber den AKTUELLEN Zustand eines Signals) beschreibt
  // dieser Fall ein GOVERNANCE-Hygiene-Problem, das unabhaengig vom
  // aktuellen Resilience-Status jederzeit relevant ist: zwei aktivierte
  // Automation-Regeln fuer denselben Trigger wuerden beim naechsten
  // passenden Ereignis BEIDE ausgeloest (core/governance-rule-conflicts.ts).
  // MEDIUM Confidence (eine Konfigurationsbeobachtung, keine Live-Messung).
  for (const conflict of automationRuleConflicts) {
    const isContradictory = conflict.kind === "CONTRADICTORY_ACTIONS";
    recommendations.push({
      kind: "AUTOMATION_RULE_GOVERNANCE_CONFLICT",
      problem: isContradictory
        ? `${conflict.rules.length} enabled automation rules for trigger "${conflict.trigger}" have DIFFERENT actions (${[...new Set(conflict.rules.map((r) => r.action))].join(", ")}) - they would all fire independently for the same event.`
        : `${conflict.rules.length} enabled automation rules for trigger "${conflict.trigger}" have the IDENTICAL action ("${conflict.rules[0]?.action}") - the same action would be triggered redundantly for a single event.`,
      relevantSignals: conflict.rules.map((r) => `Rule "${r.name}" (priority ${r.priority}): ${r.action}${r.approvalRequired ? " [approval required]" : r.autoExecute ? " [auto-execute]" : ""}`),
      recommendedAction: isContradictory
        ? "Review these rules and either disable the ones that shouldn't fire together, or differentiate their conditions so only one applies per event."
        : "Consider disabling the redundant rule(s) - only the highest-priority one is operationally necessary.",
      reasoning: "The automation engine evaluates every enabled, matching rule independently - it does not detect or prevent overlapping configuration on its own.",
      expectedEffect: "A cleaner rule set behaves more predictably and avoids duplicate or conflicting automated actions for the same event.",
      risks: isContradictory ? "If left unresolved, an operator may see two different automated responses to the same signal, which can be confusing during an incident." : "Low risk - the redundant rule currently just wastes an execution slot rather than causing harm.",
      confidence: "MEDIUM",
      requiredPermission: CHANGE_MANAGEMENT_PERMISSION,
      requiresApproval: false,
      alternative: "Leave the rules as configured if the overlap is intentional (e.g. one rule for diagnostics, one for remediation).",
      actionRef: { method: "GET", path: "/api/automation-rules/conflicts", label: "Review automation rule conflicts" },
    });
  }

  const severityRank: Record<RecommendationConfidence, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
  return recommendations.sort((a, b) => severityRank[b.confidence] - severityRank[a.confidence]);
}
