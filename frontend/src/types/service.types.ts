// Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
// Intelligence". Spiegelt src/types/service.types.ts im Backend.

export type ServiceCriticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ServiceEnvironment = "PRODUCTION" | "STAGING" | "DEVELOPMENT";
export type ServiceLifecycleStatus = "ACTIVE" | "DEPRECATED" | "RETIRED";
// Phase 55 "Vollstaendige Projekt-Informationsintegration" - siehe
// src/types/service.types.ts (Backend) / Migration 0064.
export type ServiceObservability = "OBSERVABLE" | "PARTIALLY_OBSERVABLE" | "NOT_OBSERVABLE";
export type DependencyType = "API" | "DATABASE" | "EXTERNAL_SERVICE" | "INTERNAL_SERVICE" | "QUEUE" | "STORAGE";
export type DependencyCriticality = "CRITICAL" | "OPTIONAL";
export type ServiceHealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";

export const SERVICE_CRITICALITIES: ServiceCriticality[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const SERVICE_ENVIRONMENTS: ServiceEnvironment[] = ["PRODUCTION", "STAGING", "DEVELOPMENT"];
export const SERVICE_LIFECYCLE_STATUSES: ServiceLifecycleStatus[] = ["ACTIVE", "DEPRECATED", "RETIRED"];
export const SERVICE_OBSERVABILITIES: ServiceObservability[] = ["OBSERVABLE", "PARTIALLY_OBSERVABLE", "NOT_OBSERVABLE"];
export const DEPENDENCY_TYPES: DependencyType[] = ["API", "DATABASE", "EXTERNAL_SERVICE", "INTERNAL_SERVICE", "QUEUE", "STORAGE"];
export const DEPENDENCY_CRITICALITIES: DependencyCriticality[] = ["CRITICAL", "OPTIONAL"];

export interface Service {
  id: number;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  name: string;
  description: string | null;
  technicalOwnerId: string | null;
  businessOwner: string | null;
  criticality: ServiceCriticality;
  environment: ServiceEnvironment;
  lifecycleStatus: ServiceLifecycleStatus;
  observability: ServiceObservability;
  createdAt: string;
  updatedAt: string;
  // Phase 27 "Enterprise On-Call & Escalation Management".
  escalationPolicyId: number | null;
}

export interface ServiceDependency {
  id: number;
  organizationId: string;
  sourceServiceId: number;
  targetServiceId: number;
  dependencyType: DependencyType;
  criticality: DependencyCriticality;
  description: string | null;
  createdAt: string;
}

export interface UnhealthyDependency {
  serviceId: number;
  name: string;
  criticality: DependencyCriticality;
  status: ServiceHealthStatus;
}

export interface ServiceHealth {
  status: ServiceHealthStatus;
  reasons: string[];
  ownHealth: ServiceHealthStatus;
  openIncidents: number;
  unhealthyDependencies: UnhealthyDependency[];
  rootCauseCandidates: { serviceId: number; name: string; reason: string }[];
}

export interface ImpactResultService extends Service {
  depth: number | null;
}

// Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
// affectedServices/maxDepth bleiben unveraendert (Phase-23-Feld, weiterhin
// befuellt) - alle folgenden Felder sind rein additiv.
export interface ImpactDepthGroup {
  depth: number;
  services: Service[];
}

export interface CriticalPathNode {
  serviceId: number;
  name: string;
}

export interface CriticalPath {
  services: CriticalPathNode[];
  length: number;
}

export interface SpofCandidate {
  serviceId: number;
  name: string;
  criticalDependentCount: number;
  totalDependentCount: number;
}

export interface RelatedIncidentSummary {
  id: number;
  serviceId: number;
  serviceName: string;
  severity: string;
  title: string;
}

export type SloEvaluationStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "PENDING";

export interface RelatedSloSummary {
  id: number;
  serviceId: number;
  serviceName: string;
  name: string;
  status: SloEvaluationStatus;
}

export interface RelatedAlertSummary {
  id: number;
  serviceId: number;
  serviceName: string;
  name: string;
  currentlyTriggered: boolean;
}

export interface RelatedSignals {
  openIncidents: RelatedIncidentSummary[];
  atRiskSlos: RelatedSloSummary[];
  triggeredAlerts: RelatedAlertSummary[];
}

export interface ImpactSummary {
  text: string;
  affectedCount: number;
  maxDepthReached: number;
  hasCriticalPath: boolean;
  spofCount: number;
}

export interface ImpactResult {
  affectedServices: ImpactResultService[];
  maxDepth: number;
  truncated: boolean;
  depthGroups: ImpactDepthGroup[];
  criticalPaths: CriticalPath[];
  spofCandidates: SpofCandidate[];
  related: RelatedSignals;
  summary: ImpactSummary;
}

export interface CriticalPathResult {
  criticalPaths: CriticalPath[];
  spofCandidates: SpofCandidate[];
}

export interface ServiceWithHealth extends Service {
  health: ServiceHealth;
}

export interface TopologyGraph {
  nodes: Service[];
  edges: ServiceDependency[];
  truncated: boolean;
}
