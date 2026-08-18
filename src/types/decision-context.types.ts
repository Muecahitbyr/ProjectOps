// Phase 50 "Enterprise Operational Decision & Executive Intelligence" -
// Bestandsanalyse-Ergebnis: core/service-resilience.ts#ServiceResilienceDetail
// (Phase 37/42/47) ist bereits sehr umfassend (Health/Reliability/SLO/
// Probleme/Dependencies/Blast-Radius/Change-Risk/Remediation/Forecast/
// Signale/Business-Impact), wird aber nirgends mit dem Bestaetigungsstatus
// (Phase 44), der Outcome-Historie (Phase 45), aktiven Automation-/
// Governance-Regeln (Phase 40) und der Proactive-Risk-Historie (Phase 49)
// FUER EINEN Service zusammengefuehrt. Diese Datei ergaenzt AUSSCHLIESSLICH
// die dafuer noetigen Synthese-/Empfehlungstypen - keine neue Rohsignalquelle
// (siehe core/decision-context.ts).
import type { ServiceResilienceDetail } from "./resilience.types";
import type { PriorityQueueAcknowledgment } from "./resilience.types";
import type { ProjectAcknowledgmentOutcomeHistory } from "./outcome-intelligence.types";
import type { AutomationOutcomeTrackRecordEntry } from "./automation-outcome.types";
import type { AutomationRuleConflict } from "./governance.types";

export type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type RecommendationKind =
  | "UNACKNOWLEDGED_ACTIVE_ISSUE"
  | "HIGH_RISK_CHANGE_DURING_INCIDENT"
  | "RECURRING_OUTCOME_FAILURE"
  | "PROACTIVE_RISK_ACTIVE"
  | "FORECAST_SIGNAL_NO_AUTOMATION"
  | "AGENT_CAPACITY_RISK_AFFECTING_MONITORING"
  | "AUTOMATION_RULE_GOVERNANCE_CONFLICT";

// actionRef verweist auf einen BEREITS BESTEHENDEN Endpunkt/eine bestehende
// Seite - Phase 50 fuehrt selbst NIE eine Aktion aus (Human-in-the-Loop,
// Auftragspunkt 9). null = keine direkte Aktion, nur eine Beobachtungs-
// empfehlung.
export interface RecommendationActionRef {
  method: "GET" | "POST";
  path: string;
  label: string;
}

export interface Recommendation {
  kind: RecommendationKind;
  problem: string;
  relevantSignals: string[];
  recommendedAction: string;
  reasoning: string;
  expectedEffect: string;
  risks: string;
  confidence: RecommendationConfidence;
  requiredPermission: string;
  requiresApproval: boolean;
  alternative: string | null;
  actionRef: RecommendationActionRef | null;
}

export interface DecisionContextAutomationControl {
  ruleId: number;
  name: string;
  trigger: string;
  enabled: boolean;
  autoExecute: boolean;
  approvalRequired: boolean;
}

export interface DecisionContextProactiveRisk {
  active: boolean;
  detectedAt: string | null;
  signalTitles: string[];
}

export interface DecisionContext {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  lifecycleStatus: string | null;
  businessOwner: string | null;
  generatedAt: string;
  windowHours: number;
  // Der vollstaendige, bereits bestehende technische/Business-Kontext
  // (Phase 37/42/47) - unveraendert durchgereicht, NICHT erneut berechnet.
  detail: ServiceResilienceDetail | null;
  acknowledgment: PriorityQueueAcknowledgment | null;
  outcomeHistory: ProjectAcknowledgmentOutcomeHistory | null;
  automationControls: DecisionContextAutomationControl[];
  proactiveRisk: DecisionContextProactiveRisk;
  // Phase 53 "Enterprise Operational Learning & Optimization" - aggregierte
  // Historie, ob Automation-Ausfuehrungen fuer diesen Service tatsaechlich
  // dauerhaft geholfen haben (core/automation-outcome-verification.ts
  // #getAutomationOutcomeTrackRecord()). Fliesst in die Empfehlungslogik
  // unten ein (FORECAST_SIGNAL_NO_AUTOMATION) UND wird zusaetzlich roh
  // mitgeliefert, damit Confidence/Recommendation-Qualitaet auch ausserhalb
  // einer konkreten Empfehlung nachtraeglich bewertbar ist.
  automationTrackRecord: AutomationOutcomeTrackRecordEntry[];
  // Phase 55 "Enterprise Capacity & Resource Optimization" - aktives
  // Kapazitaetsrisiko des Agenten, der dieses Projekt tatsaechlich
  // ueberwacht (core/local-agent.ts#evaluateAgentCapacityIfDue()), sofern
  // vorhanden - null, wenn keins aktiv ist ODER keinem Agenten zugeordnet
  // werden konnte.
  agentCapacityRisk: { agentId: string; agentName: string; metric: string; projectedPercent: number | null; recommendedAction: string | null } | null;
  // Phase 61 "Enterprise Operational Governance Optimization" - widerspruech-
  // liche/ueberfluessige Automation-Regeln fuer dieses Projekt (core/
  // governance-rule-conflicts.ts), roh mitgeliefert UND in AUTOMATION_RULE_
  // GOVERNANCE_CONFLICT-Empfehlungen unten uebersetzt.
  automationRuleConflicts: AutomationRuleConflict[];
  recommendations: Recommendation[];
}
