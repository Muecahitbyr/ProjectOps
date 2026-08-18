// Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
// Intelligence". Spiegelt db/migrations/0044_service_catalog_and_topology.sql.

export type ServiceCriticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ServiceEnvironment = "PRODUCTION" | "STAGING" | "DEVELOPMENT";
export type ServiceLifecycleStatus = "ACTIVE" | "DEPRECATED" | "RETIRED";
// Phase 55 "Vollstaendige Projekt-Informationsintegration" - siehe Migration
// 0064: strukturierte, abfragbare Kennzeichnung statt reiner Prosa im
// description-Feld, ob ProjectOps diesen Service ueberhaupt extern pruefen
// kann. OBSERVABLE bleibt der Default fuer alle bestehenden/normalen
// Service-Zeilen.
export type ServiceObservability = "OBSERVABLE" | "PARTIALLY_OBSERVABLE" | "NOT_OBSERVABLE";
export type DependencyType = "API" | "DATABASE" | "EXTERNAL_SERVICE" | "INTERNAL_SERVICE" | "QUEUE" | "STORAGE";
export type DependencyCriticality = "CRITICAL" | "OPTIONAL";

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
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Phase 27 "Enterprise On-Call & Escalation Management" - Zuordnung
  // "Policy einem Service-Kontext zuordnen" (siehe types/escalation-policy.types.ts).
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
  createdBy: string | null;
  createdAt: string;
}

// Auftragspunkt 2 "Service Catalog" - "keine redundanten Statusfelder, wenn
// bestehende Daten verwendet werden koennen": Health wird NIE gespeichert,
// immer live aus check_results/incidents/slos abgeleitet (core/service-health.ts).
export type ServiceHealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";

export interface ServiceHealth {
  status: ServiceHealthStatus;
  reasons: string[];
  ownHealth: ServiceHealthStatus;
  openIncidents: number;
  unhealthyDependencies: { serviceId: number; name: string; criticality: DependencyCriticality; status: ServiceHealthStatus }[];
}
