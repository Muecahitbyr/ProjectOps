// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence".
// Spiegelt src/types/service-portfolio.types.ts im Backend.
import type { ServiceCriticality, ServiceEnvironment, ServiceLifecycleStatus } from "./service.types";
import type { ResilienceStatus } from "./resilience.types";
import type { BusinessImpactTier } from "./business-impact.types";

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
