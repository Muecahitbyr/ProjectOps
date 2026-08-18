// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence" -
// Bestandsanalyse-Ergebnis: services.lifecycleStatus (Phase 23,
// ACTIVE/DEPRECATED/RETIRED) existiert bereits als manuell gepflegtes
// Katalogfeld, war aber bislang NIE mit technischer/Business-Intelligence
// verbunden - exakt derselbe "isolierte Metadaten"-Befund wie
// services.criticality vor Phase 47. Diese Datei erfindet KEINE zweite
// Registry/keinen zweiten Score - reine Korrelationsschicht ueber bereits
// bestehende, bereits bounded Org-Uebersichten (core/service-portfolio.ts).
import type { ServiceCriticality, ServiceEnvironment, ServiceLifecycleStatus } from "./service.types";
import type { ResilienceStatus } from "./resilience.types";
import type { BusinessImpactTier } from "./business-impact.types";

// Entscheidungsleiter (nicht Punktesumme, siehe core/service-portfolio.ts
// fuer die vollstaendige, dokumentierte Herleitung):
//   INSUFFICIENT_DATA:            kein Monitoring-Projekt verknuepft/keine
//                                 Messdaten - keine Aussage moeglich.
//   RETIREMENT_RISK:              DEPRECATED, aber noch echte Abhaengigkeiten
//                                 vorhanden - unbedachtes Abschalten waere riskant.
//   STRATEGIC_REVIEW_RECOMMENDED: ACTIVE, aber chronisch CRITICAL mit
//                                 wiederkehrendem Muster - strukturelles,
//                                 kein vorbeigehendes Problem.
//   AT_RISK:                     aktuell CRITICAL/AT_RISK oder ein
//                                 degradierender Forecast-Trend.
//   NEEDS_ATTENTION:              leichtere, aber echte Auffaelligkeiten.
//   STABLE:                      keine der obigen Bedingungen trifft zu.
export type PortfolioClassification = "STABLE" | "NEEDS_ATTENTION" | "AT_RISK" | "STRATEGIC_REVIEW_RECOMMENDED" | "RETIREMENT_RISK" | "INSUFFICIENT_DATA";

export type PortfolioReasonKind =
  | "NO_MONITORING_DATA"
  | "CURRENT_STATUS"
  | "RECURRING_INCIDENTS"
  | "OPEN_CRITICAL_PROBLEMS"
  | "ERROR_BUDGET_RISK"
  | "CAPACITY_TREND"
  | "BUSINESS_IMPACT"
  | "RECURRING_OUTCOME_FAILURE"
  | "DEPRECATED_WITH_DEPENDENTS";

export interface PortfolioReason {
  kind: PortfolioReasonKind;
  detail: string;
}

// businessImpactTier/isRecurringOutcomePattern/hasCapacitySignal sind
// bewusst "T | null | 'NOT_EVALUATED'"-artig modelliert (siehe
// core/service-portfolio.ts): diese drei Signale stammen aus bounded
// Top-N-Uebersichten (Phase 45/46/47) - ein Service, der dort NICHT
// auftaucht, wurde nicht zwangslaeufig geprueft und fuer gut befunden,
// sondern moeglicherweise nur nicht unter den Top-Kandidaten. "not
// evaluated" verhindert, dass ein Nicht-Vorkommen faelschlich als "positiv
// bestaetigt" interpretiert wird.
export interface ServicePortfolioEntry {
  serviceId: number;
  serviceName: string;
  projectId: string | null;
  projectName: string | null;
  criticality: ServiceCriticality;
  lifecycleStatus: ServiceLifecycleStatus;
  environment: ServiceEnvironment;
  businessOwner: string | null;
  resilienceStatus: ResilienceStatus | null;
  dependentCount: number;
  isPotentialSpof: boolean;
  businessImpactTier: BusinessImpactTier | "NOT_EVALUATED";
  hasCapacitySignal: boolean | "NOT_EVALUATED";
  isRecurringOutcomePattern: boolean | "NOT_EVALUATED";
  classification: PortfolioClassification;
  reasons: PortfolioReason[];
}

export interface ServicePortfolioSummary {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  totalServices: number;
  counts: Record<PortfolioClassification, number>;
  entries: ServicePortfolioEntry[];
}
