// Phase 63 "Enterprise Operational Portfolio Intelligence" - Bestandsanalyse-
// Ergebnis: die Plattform besitzt bereits 7+ unabhaengige, org-weite
// Uebersichten (Priority Queue/43, Capacity Watchlist/46/54, Service
// Portfolio/48, Risk Correlation/58, Control Effectiveness/60, Governance
// Rule Conflicts/61, Outcome/Decision Quality/45/62) - aber KEINE kombiniert
// sie zu EINEM Gesamtbild. Diese Datei ergaenzt AUSSCHLIESSLICH die dafuer
// noetigen Zusammenfuehrungs-/Cross-Reference-Typen - keine neue
// Rohsignalquelle (siehe core/operational-state.ts).
import type { RiskCorrelationGroup } from "./risk-correlation.types";
import type { PortfolioClassification } from "./service-portfolio.types";
import type { DecisionQuality } from "./outcome-intelligence.types";

// "Wo entstehen kumulative Risiken?" - ein Projekt, das gleichzeitig in
// MEHREREN unabhaengigen, bereits bestehenden Risikolisten auftaucht (nicht
// nur in einer), traegt ein hoeheres Gesamtrisiko als die Summe seiner
// Einzelteile vermuten liesse - bisher nirgends sichtbar, da jede Liste nur
// isoliert betrachtet wird.
export type CumulativeRiskSource = "PRIORITY_QUEUE" | "CAPACITY_WATCHLIST" | "RISK_CORRELATION" | "RECURRING_SAFETY_BLOCK";

export interface CumulativeRiskEntry {
  projectId: string;
  projectName: string;
  riskSourceCount: number;
  riskSources: CumulativeRiskSource[];
}

// "Welche Decisions konkurrieren um dieselben Ressourcen?" - zwei aktuell
// SCHEDULED/IN_PROGRESS Changes, deren Blast Radius (Phase 25/57) sich in
// mindestens einem Service ueberschneidet, konkurrieren faktisch um
// dieselbe zugrundeliegende Infrastruktur, auch wenn sie unterschiedlichen
// Projekten zugeordnet sind - der bestehende Wartungsfenster-Konflikt
// (Phase 29) erkennt nur den Spezialfall "dasselbe Projekt".
export interface CompetingChangePair {
  changeAId: number;
  changeATitle: string;
  changeBId: number;
  changeBTitle: string;
  sharedServiceIds: number[];
  sharedServiceNames: string[];
}

export interface OperationalStateOverview {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  criticalServiceCount: number;
  atRiskServiceCount: number;
  capacityWatchlistCount: number;
  riskCorrelationGroups: RiskCorrelationGroup[];
  automationGovernanceConflictProjectCount: number;
  portfolioCounts: Record<PortfolioClassification, number>;
  decisionQualityCounts: Record<DecisionQuality, number>;
  avgDecisionLatencyMs: number | null;
  changeSafetyBlockTriggeredCount: number;
  changeApprovedThenFailedCount: number;
  cumulativeRiskServices: CumulativeRiskEntry[];
  competingChanges: CompetingChangePair[];
}
