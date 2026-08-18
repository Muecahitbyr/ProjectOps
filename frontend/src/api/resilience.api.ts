import { apiClient } from "./client";
import type {
  ResilienceOverview,
  ResilienceOverviewParams,
  ServiceResilienceDetail,
  ServiceDependencyIntelligence,
  ResilienceSignal,
  PriorityQueue,
  PriorityQueueAcknowledgment,
} from "../types/resilience.types";
import type { OutcomeIntelligenceSummary, ProjectAcknowledgmentOutcomeHistory } from "../types/outcome-intelligence.types";
import type { CapacityWatchlist } from "../types/capacity-intelligence.types";
import type { BusinessImpactOverview } from "../types/business-impact.types";
import type { ForecastAccuracySummary } from "../types/proactive-risk.types";
import type { DecisionContext } from "../types/decision-context.types";
import type { AttentionList } from "../types/attention.types";
import type { OperationalStateOverview } from "../types/operational-state.types";

// Phase 37 "Enterprise Service Resilience & Dependency Intelligence" - reine
// Lese-Endpunkte, Filter werden 1:1 als Query-Parameter durchgereicht
// (routes/resilience.routes.ts), analog zu api/reliability.api.ts (Phase 33).
export async function fetchResilienceOverview(params: ResilienceOverviewParams): Promise<ResilienceOverview> {
  const { data } = await apiClient.get<ResilienceOverview>("/api/resilience/overview", { params });
  return data;
}

export async function fetchServiceResilienceDetail(projectId: string, range: string): Promise<ServiceResilienceDetail> {
  const { data } = await apiClient.get<ServiceResilienceDetail>(`/api/resilience/services/${projectId}`, { params: { range } });
  return data;
}

export async function fetchServiceResilienceDependencies(projectId: string, range: string): Promise<ServiceDependencyIntelligence> {
  const { data } = await apiClient.get<ServiceDependencyIntelligence>(`/api/resilience/services/${projectId}/dependencies`, { params: { range } });
  return data;
}

export async function fetchServiceResilienceSignals(projectId: string, range: string): Promise<{ signals: ResilienceSignal[] }> {
  const { data } = await apiClient.get<{ signals: ResilienceSignal[] }>(`/api/resilience/services/${projectId}/signals`, { params: { range } });
  return data;
}

// Phase 43 "Enterprise Operational Priority Intelligence".
export async function fetchPriorityQueue(params: ResilienceOverviewParams): Promise<PriorityQueue> {
  const { data } = await apiClient.get<PriorityQueue>("/api/resilience/priority-queue", { params });
  return data;
}

// Phase 44 "Enterprise Priority Queue Acknowledgment Governance".
export async function fetchPriorityItemAcknowledgment(projectId: string): Promise<{ acknowledgment: PriorityQueueAcknowledgment | null }> {
  const { data } = await apiClient.get<{ acknowledgment: PriorityQueueAcknowledgment | null }>(`/api/resilience/services/${projectId}/acknowledgment`);
  return data;
}

export async function acknowledgePriorityItem(
  projectId: string,
  range: string,
  note?: string,
): Promise<{ acknowledgment: PriorityQueueAcknowledgment; alreadyAcknowledged: boolean }> {
  const { data } = await apiClient.post<{ acknowledgment: PriorityQueueAcknowledgment; alreadyAcknowledged: boolean }>(
    `/api/resilience/services/${projectId}/acknowledge`,
    { range, ...(note ? { note } : {}) },
  );
  return data;
}

// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement Intelligence".
export async function fetchAcknowledgmentOutcomeHistory(projectId: string, range: string): Promise<ProjectAcknowledgmentOutcomeHistory> {
  const { data } = await apiClient.get<ProjectAcknowledgmentOutcomeHistory>(`/api/resilience/services/${projectId}/acknowledgment-history`, { params: { range } });
  return data;
}

export async function fetchOutcomeIntelligenceSummary(params: ResilienceOverviewParams): Promise<OutcomeIntelligenceSummary> {
  const { data } = await apiClient.get<OutcomeIntelligenceSummary>("/api/resilience/outcomes", { params });
  return data;
}

// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence".
export async function fetchCapacityWatchlist(params: ResilienceOverviewParams): Promise<CapacityWatchlist> {
  const { data } = await apiClient.get<CapacityWatchlist>("/api/resilience/capacity-watchlist", { params });
  return data;
}

// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence".
export async function fetchBusinessImpactOverview(params: ResilienceOverviewParams): Promise<BusinessImpactOverview> {
  const { data } = await apiClient.get<BusinessImpactOverview>("/api/resilience/business-impact", { params });
  return data;
}

// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence".
export async function fetchForecastAccuracySummary(params: ResilienceOverviewParams): Promise<ForecastAccuracySummary> {
  const { data } = await apiClient.get<ForecastAccuracySummary>("/api/resilience/proactive-risk-accuracy", { params });
  return data;
}

// Phase 50 "Enterprise Operational Decision & Executive Intelligence".
export async function fetchDecisionContext(projectId: string, range: string): Promise<DecisionContext> {
  const { data } = await apiClient.get<DecisionContext>(`/api/resilience/services/${projectId}/decision-context`, { params: { range } });
  return data;
}

// Phase 63 "Enterprise Operational Portfolio Intelligence".
export async function fetchOperationalState(params: ResilienceOverviewParams): Promise<OperationalStateOverview> {
  const { data } = await apiClient.get<OperationalStateOverview>("/api/resilience/operational-state", { params });
  return data;
}

// Phase 64 "Enterprise Operational Priority & Attention Management".
export interface AttentionListParams extends ResilienceOverviewParams {
  limit?: number;
  assignedToMe?: boolean;
}
export async function fetchAttentionList(params: AttentionListParams): Promise<AttentionList> {
  const { data } = await apiClient.get<AttentionList>("/api/resilience/attention-list", { params });
  return data;
}
