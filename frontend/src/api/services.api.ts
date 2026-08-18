import { apiClient } from "./client";
import type {
  CriticalPathResult,
  DependencyCriticality,
  DependencyType,
  ImpactResult,
  Service,
  ServiceCriticality,
  ServiceDependency,
  ServiceEnvironment,
  ServiceHealth,
  ServiceHealthStatus,
  ServiceLifecycleStatus,
  ServiceWithHealth,
  TopologyGraph,
} from "../types/service.types";

export interface ServicesQuery {
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  criticality?: ServiceCriticality;
  environment?: ServiceEnvironment;
  lifecycleStatus?: ServiceLifecycleStatus;
  health?: ServiceHealthStatus;
}

export async function fetchServices(query: ServicesQuery = {}): Promise<ServiceWithHealth[]> {
  const { data } = await apiClient.get<ServiceWithHealth[]>("/api/platform/services", { params: query });
  return data;
}

export async function fetchService(id: string): Promise<Service> {
  const { data } = await apiClient.get<Service>(`/api/platform/services/${id}`);
  return data;
}

export async function fetchServiceHealth(id: string): Promise<ServiceHealth> {
  const { data } = await apiClient.get<ServiceHealth>(`/api/platform/services/${id}/health`);
  return data;
}

export async function fetchServiceDependencies(id: string): Promise<ServiceDependency[]> {
  const { data } = await apiClient.get<ServiceDependency[]>(`/api/platform/services/${id}/dependencies`);
  return data;
}

export async function fetchServiceDependents(id: string): Promise<ServiceDependency[]> {
  const { data } = await apiClient.get<ServiceDependency[]>(`/api/platform/services/${id}/dependents`);
  return data;
}

export async function fetchServiceImpact(id: string, fresh = false): Promise<ImpactResult> {
  const { data } = await apiClient.get<ImpactResult>(`/api/platform/services/${id}/impact`, { params: fresh ? { fresh: "true" } : {} });
  return data;
}

// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis".
export async function fetchServiceCriticalPath(id: string): Promise<CriticalPathResult> {
  const { data } = await apiClient.get<CriticalPathResult>(`/api/platform/services/${id}/critical-path`);
  return data;
}

export async function fetchTopology(organizationId: string, teamId?: string): Promise<TopologyGraph> {
  const { data } = await apiClient.get<TopologyGraph>("/api/platform/topology", { params: { organizationId, ...(teamId ? { teamId } : {}) } });
  return data;
}

export interface CreateServiceInput {
  organizationId: string;
  teamId?: string;
  projectId?: string;
  name: string;
  description?: string;
  technicalOwnerId?: string;
  businessOwner?: string;
  criticality?: ServiceCriticality;
  environment?: ServiceEnvironment;
  lifecycleStatus?: ServiceLifecycleStatus;
}

export async function createService(input: CreateServiceInput): Promise<Service> {
  const { data } = await apiClient.post<Service>("/api/platform/services", input);
  return data;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  teamId?: string | null;
  projectId?: string | null;
  technicalOwnerId?: string | null;
  businessOwner?: string | null;
  criticality?: ServiceCriticality;
  environment?: ServiceEnvironment;
  lifecycleStatus?: ServiceLifecycleStatus;
  escalationPolicyId?: number | null;
}

export async function updateService(id: string, input: UpdateServiceInput): Promise<Service> {
  const { data } = await apiClient.patch<Service>(`/api/platform/services/${id}`, input);
  return data;
}

export async function deleteService(id: string): Promise<void> {
  await apiClient.delete(`/api/platform/services/${id}`);
}

export interface CreateDependencyInput {
  targetServiceId: number;
  dependencyType: DependencyType;
  criticality?: DependencyCriticality;
  description?: string;
}

export async function createDependency(serviceId: string, input: CreateDependencyInput): Promise<ServiceDependency & { cyclic: boolean }> {
  const { data } = await apiClient.post<ServiceDependency & { cyclic: boolean }>(`/api/platform/services/${serviceId}/dependencies`, input);
  return data;
}

export async function deleteDependency(serviceId: string, dependencyId: string): Promise<void> {
  await apiClient.delete(`/api/platform/services/${serviceId}/dependencies/${dependencyId}`);
}

// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence".
export async function fetchServicePortfolio(organizationId: string, range: string): Promise<import("../types/service-portfolio.types").ServicePortfolioSummary> {
  const { data } = await apiClient.get<import("../types/service-portfolio.types").ServicePortfolioSummary>("/api/platform/services/portfolio", { params: { organizationId, range } });
  return data;
}
