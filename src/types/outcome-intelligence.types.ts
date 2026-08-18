// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence" - Bestandsanalyse-Ergebnis: Phase 44 (types/resilience.types.ts
// #PriorityQueueAcknowledgment) erzeugt Governance-Entscheidungen, wertet
// aber nie aus, ob die Entscheidung tatsaechlich zu einer Verbesserung
// gefuehrt hat. Diese Datei ergaenzt AUSSCHLIESSLICH die dafuer noetigen
// Ergebnis-/Aggregationstypen - keine neue Rohsignalquelle, keine neue
// Statustabelle (core/outcome-intelligence.ts leitet alles live aus
// audit_log ab, siehe dortige Kopfkommentare).
import type { ResilienceStatus } from "./resilience.types";

// RESOLVED:            HEALTHY erreicht UND das der letzte bekannte Zustand
//                       innerhalb des Messzeitraums (nachhaltig).
// PARTIALLY_RESOLVED:   Zustand hat sich gegenueber dem Ausgangs-Snapshot
//                       verbessert, aber weder HEALTHY erreicht noch bis
//                       Fensterende gehalten.
// REGRESSED:            nach mindestens einer Verbesserung innerhalb des
//                       Fensters erneut verschlechtert ("Rueckfall").
// UNRESOLVED:           Messfenster abgelaufen, aber zu keinem Zeitpunkt
//                       eine Verbesserung gegenueber dem Ausgangs-Snapshot
//                       beobachtet.
// INSUFFICIENT_DATA:    Messfenster noch nicht abgelaufen UND bislang keine
//                       eindeutige Verschlechterung - keine unbegruendete
//                       Aussage moeglich (Auftragspunkt 11 "keine
//                       vorgetaeuschte Sicherheit").
export type AcknowledgmentOutcomeStatus = "RESOLVED" | "PARTIALLY_RESOLVED" | "REGRESSED" | "UNRESOLVED" | "INSUFFICIENT_DATA";

// Phase 62 "Enterprise Operational Decision Quality" - Bestandsanalyse-
// Ergebnis: AcknowledgmentOutcome (Phase 45) misst bereits, OB die Ent-
// scheidung wirksam war (outcomeStatus) und WIE LANGE die Erholung DANACH
// dauerte (timeToRecoveryMs) - aber nicht, wie lange es VOR der
// Entscheidung dauerte, bis ueberhaupt jemand handelte. "War die
// Entscheidung zu spaet?" war damit strukturell unbeantwortbar, obwohl die
// dafuer noetigen Rohdaten (RESILIENCE_STATUS_DEGRADED-Zeitpunkt +
// acknowledgedAt) bereits in derselben Funktion vorliegen (siehe
// core/outcome-intelligence.ts#buildOutcomesForProject()) - keine neue
// Abfrage noetig.
// PROMPT:       <=30 Minuten zwischen Verschlechterung und Bestaetigung.
// DELAYED:      30 Minuten bis 4 Stunden.
// VERY_DELAYED: > 4 Stunden.
// UNKNOWN:      keine vorausgehende RESILIENCE_STATUS_DEGRADED-Transition
//               im Zeitfenster gefunden (z.B. Bestaetigung ohne
//               vorausgehenden Statuswechsel, oder Wechsel ausserhalb der
//               abgefragten Historie) - keine erfundene Aussage.
export type DecisionTimeliness = "PROMPT" | "DELAYED" | "VERY_DELAYED" | "UNKNOWN";

// Kombiniert Timeliness (davor) UND Effectiveness (danach, bereits
// bestehend) zu EINEM Entscheidungsqualitaets-Urteil:
//   GOOD:                  PROMPT/DELAYED UND wirksam (RESOLVED/PARTIALLY_RESOLVED).
//   LATE_BUT_EFFECTIVE:    VERY_DELAYED, aber trotzdem wirksam.
//   PROMPT_BUT_INEFFECTIVE: PROMPT/DELAYED, aber NICHT wirksam (REGRESSED/UNRESOLVED).
//   POOR:                  VERY_DELAYED UND nicht wirksam.
//   INCONCLUSIVE:          Timeliness UNKNOWN ODER Outcome noch INSUFFICIENT_DATA.
export type DecisionQuality = "GOOD" | "LATE_BUT_EFFECTIVE" | "PROMPT_BUT_INEFFECTIVE" | "POOR" | "INCONCLUSIVE";

export interface AcknowledgmentOutcome {
  acknowledgedAt: string;
  acknowledgedBy: string;
  note: string | null;
  snapshotResilienceStatus: ResilienceStatus;
  snapshotPriorityScore: number;
  snapshotReason: string | null;
  outcomeStatus: AcknowledgmentOutcomeStatus;
  outcomeReason: string;
  bestStatusReached: ResilienceStatus;
  finalStatus: ResilienceStatus;
  transitionCount: number;
  timeToRecoveryMs: number | null;
  measurementWindowHours: number;
  windowElapsed: boolean;
  evaluatedAt: string;
  // Phase 62 "Enterprise Operational Decision Quality".
  decisionLatencyMs: number | null;
  decisionTimeliness: DecisionTimeliness;
  decisionQuality: DecisionQuality;
}

export interface ProjectAcknowledgmentOutcomeHistory {
  projectId: string;
  projectName: string;
  outcomes: AcknowledgmentOutcome[];
}

export interface OutcomeIntelligenceProjectSummary {
  projectId: string;
  projectName: string;
  totalAcknowledgments: number;
  resolvedCount: number;
  partiallyResolvedCount: number;
  regressedCount: number;
  unresolvedCount: number;
  insufficientDataCount: number;
  isRecurringPattern: boolean;
}

export interface OutcomeIntelligenceSummary {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  totalAcknowledgments: number;
  evaluatedAcknowledgments: number;
  counts: Record<AcknowledgmentOutcomeStatus, number>;
  resolutionRatePercent: number | null;
  avgTimeToRecoveryMs: number | null;
  // Phase 62 "Enterprise Operational Decision Quality".
  avgDecisionLatencyMs: number | null;
  decisionQualityCounts: Record<DecisionQuality, number>;
  recurringProjects: OutcomeIntelligenceProjectSummary[];
  projects: OutcomeIntelligenceProjectSummary[];
}
