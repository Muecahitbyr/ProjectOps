// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
// Bestandsanalyse-Ergebnis: services.criticality (Phase 23) bleibt die
// EINZIGE Criticality-Definition - diese Datei erfindet KEINE zweite. Sie
// verdichtet ausschliesslich bereits vorhandene Daten (Criticality,
// core/topology.ts#getFullImpactAnalysis()'s affectedServices/related,
// core/service-resilience.ts's signals-Taxonomie) zu einer nachvollziehbaren
// Business-Impact-Aussage. Keine erfundenen Geld-/Umsatzwerte (Auftrag
// verbietet das explizit) - ausschliesslich qualitative, relative Stufen.
import type { ServiceCriticality } from "./service.types";
import type { ResilienceStatus } from "./resilience.types";

export type BusinessImpactTier = "SEVERE" | "HIGH" | "MODERATE" | "LOW" | "NONE" | "UNKNOWN";

// UNKNOWN: kein Service-Katalogeintrag verknuepft - Impact kann grundsaetzlich
// nicht bestimmt werden (nie als "NONE"/"LOW" geraten, siehe Auftragspunkt 7
// "keine unbegruendeten Business-Schaetzungen").
// COMPLETE: Blast-Radius vollstaendig ermittelt (kein Tiefenlimit erreicht).
// TRUNCATED: core/topology.ts's MAX_TOPOLOGY_DEPTH wurde erreicht - der
// tatsaechliche Impact koennte groesser sein als hier dargestellt.
export type BusinessImpactDataQuality = "UNKNOWN" | "COMPLETE" | "TRUNCATED";

export type BusinessImpactFactorKind = "OWN_SERVICE_SIGNAL" | "DEPENDENT_OPEN_INCIDENT" | "DEPENDENT_AT_RISK_SLO" | "DEPENDENT_TRIGGERED_ALERT";

// Strukturierte, aus bereits bestehenden Datensaetzen (Signale/Incidents/
// SLOs/Alerts, siehe core/business-impact.ts) zusammengesetzte Begruendung -
// KEIN Freitext/KEINE KI-Formulierung, jeder Eintrag verweist auf ein
// konkretes, bereits existierendes Objekt.
export interface BusinessImpactFactor {
  kind: BusinessImpactFactorKind;
  serviceId: number;
  serviceName: string;
  serviceCriticality: ServiceCriticality;
  businessOwner: string | null;
  detail: string;
}

export interface ServiceBusinessImpact {
  tier: BusinessImpactTier;
  dataQuality: BusinessImpactDataQuality;
  ownCriticality: ServiceCriticality | null;
  ownBusinessOwner: string | null;
  affectedDependentCount: number;
  activelyImpactedDependentCount: number;
  factors: BusinessImpactFactor[];
  // Bereits im Blast-Radius gesammelte offene Incidents (core/topology.ts#
  // getRelatedSignals) - direkter Einstiegspunkt in die bestehende Phase-31-
  // Stakeholder-Communication-Werkzeuge, OHNE diese hier zu duplizieren.
  relatedOpenIncidentIds: number[];
}

export interface BusinessImpactOverviewEntry {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  resilienceStatus: ResilienceStatus;
  businessImpact: ServiceBusinessImpact;
}

export interface BusinessImpactOverview {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  candidatesEvaluated: number;
  entries: BusinessImpactOverviewEntry[];
}
