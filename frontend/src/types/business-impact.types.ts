// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence".
// Spiegelt src/types/business-impact.types.ts im Backend.
import type { ServiceCriticality } from "./service.types";
import type { ResilienceStatus } from "./resilience.types";

export type BusinessImpactTier = "SEVERE" | "HIGH" | "MODERATE" | "LOW" | "NONE" | "UNKNOWN";
export type BusinessImpactDataQuality = "UNKNOWN" | "COMPLETE" | "TRUNCATED";
export type BusinessImpactFactorKind = "OWN_SERVICE_SIGNAL" | "DEPENDENT_OPEN_INCIDENT" | "DEPENDENT_AT_RISK_SLO" | "DEPENDENT_TRIGGERED_ALERT";

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
