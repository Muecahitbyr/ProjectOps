// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations" -
// Bestandsanalyse-Ergebnis: db/automation-executions.repository.ts bereits
// misst nur TECHNISCHEN Erfolg (status=SUCCESS/FAILED). Diese Datei ergaenzt
// AUSSCHLIESSLICH den dafuer noetigen OPERATIVEN Outcome-Typ - keine zweite
// Execution-/Status-Definition (siehe core/automation-outcome-verification.ts).
export type AutomationExecutionOutcomeStatus = "IMPROVED" | "REGRESSED" | "NOT_IMPROVED" | "PENDING" | "NOT_APPLICABLE";

// Phase 52 "Continuous Operational Assurance" - Bestandsanalyse-Ergebnis:
// core/automation-outcome-verification.ts (Phase 51) bewertet eine
// Execution genau EINMAL, in einem festen 30-Minuten-Fenster, und nie
// wieder - anders als SLO-/Resilience-/Proactive-Risk-Bewertung (die "fuer
// immer" bei jedem Scheduler-Tick neu laufen) fehlte hier die einzige
// tatsaechliche Luecke der Kette "...->Outcome->Re-Evaluation". `durability`
// ist bewusst ein EIGENES, zusaetzliches Feld statt einer Aenderung an
// `status` - der urspruengliche Verifikations-Zeitpunkt/-Befund (Phase 51)
// bleibt historisch unveraendert, `durability` beschreibt ausschliesslich,
// ob diese Verbesserung angehalten hat:
//   MONITORING:     das 24h-Nachbeobachtungsfenster laeuft noch.
//   DURABLE:        Fenster abgelaufen, keine erneute Verschlechterung -
//                   LIVE aus der Abwesenheit eines REGRESSED-Later-Eintrags
//                   abgeleitet (kein Schreibvorgang fuer den Normalfall).
//   REGRESSED:      eine echte Verschlechterung trat INNERHALB der 24h nach
//                   der urspruenglichen Verifikation ein - dokumentiert
//                   ueber einen neuen Audit-Eintrag.
export type OutcomeDurability = "MONITORING" | "DURABLE" | "REGRESSED";

export interface AutomationExecutionOutcome {
  executionId: number;
  automationActionId: number;
  actionType: string;
  trigger: string;
  projectId: string;
  status: AutomationExecutionOutcomeStatus;
  reason: string;
  verifiedAt: string | null;
  // Nur befuellt, wenn status === "IMPROVED" (Durability ist nur fuer eine
  // tatsaechlich verifizierte Verbesserung eine sinnvolle Frage).
  durability: OutcomeDurability | null;
  durabilityReason: string | null;
  regressedAt: string | null;
}

// Phase 53 "Enterprise Operational Learning & Optimization" -
// Bestandsanalyse-Ergebnis: Phase 51/52 schreiben bereits einen
// vollstaendigen operativen Outcome-/Durability-Trail pro Execution, aber
// NICHTS aggregiert ihn ueber die Zeit - Empfehlungen (Phase 50) konnten
// bisher nicht wissen, ob eine bestimmte Automations-Art fuer ein Projekt
// TATSAECHLICH historisch geholfen hat. Dieser Typ traegt AUSSCHLIESSLICH
// die dafuer noetige Aggregation - keine neue Rohsignalquelle, siehe
// core/automation-outcome-verification.ts#getAutomationOutcomeTrackRecord().
export type AutomationOutcomeTrackRecordClassification = "EFFECTIVE" | "MIXED" | "INEFFECTIVE" | "INSUFFICIENT_DATA";

export interface AutomationOutcomeTrackRecordEntry {
  actionType: string;
  trigger: string;
  totalVerified: number;
  durableImprovedCount: number;
  regressedCount: number;
  notImprovedCount: number;
  classification: AutomationOutcomeTrackRecordClassification;
}
