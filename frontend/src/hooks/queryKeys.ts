import type { IncidentsQuery } from "../api/incidents.api";
import type { TimelineParams } from "../api/dashboard.api";
import type {
  DrillDownParams,
  RangeParams,
  ResponseTimeParams,
  SummaryParams,
} from "../api/analytics.api";
import type { AlertEventQuery } from "../types/alert.types";
import type { AuditLogQuery } from "../api/audit.api";
import type { ForecastMetric } from "../types/forecast.types";
import type { AgentLogQuery, ClusterEventQuery } from "../api/cluster.api";

// Zentrale Query-Key-Fabrik - vermeidet magische String-Arrays verstreut
// ueber die Hooks und haelt Invalidierungs-/Caching-Hierarchien konsistent.
export const queryKeys = {
  dashboardSummary: ["dashboard", "summary"] as const,
  dashboardEvents: (limit: number) => ["dashboard", "events", limit] as const,
  timeline: (params: TimelineParams) => ["dashboard", "timeline", params] as const,
  projectsHealth: ["projects", "health"] as const,
  projectDetail: (projectId: string) => ["projects", "health", projectId] as const,
  incidents: (query: IncidentsQuery) => ["incidents", query] as const,
  incident: (id: string) => ["incidents", "detail", id] as const,
  incidentTimeline: (id: string) => ["incidents", "detail", id, "timeline"] as const,
  users: ["users"] as const,
  user: (userId: string) => ["users", userId] as const,
  roles: ["roles"] as const,
  projectMembers: (projectId: string) => ["projects", "members", projectId] as const,
  alerts: (projectId?: string) => ["alerts", projectId ?? "all"] as const,
  alert: (id: string) => ["alerts", "detail", id] as const,
  notificationChannels: ["notification-channels"] as const,
  notificationSettings: (userId: string) => ["notification-settings", userId] as const,
  // Ein gemeinsames "analytics"-Praefix fuer alle Analytics-Query-Keys -
  // useRealtime.ts invalidiert bei relevanten WebSocket-Events per Praefix
  // (["analytics"]) statt jeden einzelnen Endpunkt aufzuzaehlen, siehe dort.
  analyticsSummary: (params: SummaryParams) => ["analytics", "summary", params] as const,
  analyticsHistory: (projectId: string, params: RangeParams) => ["analytics", "history", projectId, params] as const,
  analyticsSla: (projectId: string, hours: number) => ["analytics", "sla", projectId, hours] as const,
  analyticsIncidents: (params: SummaryParams) => ["analytics", "incidents", params] as const,
  analyticsResponseTime: (params: ResponseTimeParams) => ["analytics", "response-time", params] as const,
  analyticsCompare: (projectAId: string, projectBId: string, hours: number) =>
    ["analytics", "compare", projectAId, projectBId, hours] as const,
  analyticsDrilldown: (params: DrillDownParams) => ["analytics", "drilldown", params] as const,
  escalationSteps: (alertRuleId: string) => ["alerts", "escalation", alertRuleId] as const,
  alertEvents: (query: AlertEventQuery) => ["alert-events", query] as const,
  maintenanceWindows: (projectId?: string) => ["maintenance", projectId ?? "all"] as const,
  rootIncidents: ["root-incidents"] as const,
  automationActions: (projectId?: string, status?: string) => ["automation-actions", projectId ?? "all", status ?? "all"] as const,
  automationActionExecutions: (actionId: string) => ["automation-actions", actionId, "executions"] as const,
  automationRules: (projectId?: string) => ["automation-rules", projectId ?? "all"] as const,
  automationExecutions: (projectId?: string, status?: string) => ["automation-executions", projectId ?? "all", status ?? "all"] as const,
  automationExecution: (id: string) => ["automation-executions", "detail", id] as const,
  automationExecutionLogs: (id: string, level?: string) => ["automation-executions", id, "logs", level ?? "all"] as const,
  // Phase 51 "Enterprise Decision Execution & Closed-Loop Operations".
  automationExecutionOutcome: (id: string) => ["automation-executions", id, "outcome"] as const,
  automationTemplates: ["automation-templates"] as const,
  automationAnalytics: (projectId?: string) => ["automation-analytics", projectId ?? "all"] as const,
  // Phase 13 "Enterprise Observability, Distributed Monitoring & Production
  // Operations".
  monitoringAgents: ["monitoring-agents"] as const,
  monitoringAgent: (id: string) => ["monitoring-agents", id] as const,
  publicStatusPage: ["public-status-page"] as const,
  publicStatusHistory: (projectId: string, days: number) => ["public-status-page", "history", projectId, days] as const,
  auditLog: (query: AuditLogQuery) => ["audit-log", query] as const,
  backups: ["backups"] as const,
  backup: (id: string) => ["backups", id] as const,
  diagnostics: ["diagnostics"] as const,
  disasterRecovery: ["disaster-recovery"] as const,
  forecast: (metric: ForecastMetric, scopeId?: string) => ["forecast", metric, scopeId ?? "all"] as const,
  slaReport: (projectId: string, hours: number) => ["sla-report", projectId, hours] as const,
  // Phase 14 "Enterprise Multi-Node Cluster, Remote Agents & High Availability".
  clusterOverview: ["cluster", "overview"] as const,
  clusterHealth: ["cluster", "health"] as const,
  clusterDistribution: ["cluster", "distribution"] as const,
  clusterAnalytics: ["cluster", "analytics"] as const,
  clusterFailoverHistory: (limit: number) => ["cluster", "failover", limit] as const,
  clusterStrategies: ["cluster", "strategies"] as const,
  agentLogs: (query: AgentLogQuery) => ["cluster", "logs", query] as const,
  clusterEvents: (query: ClusterEventQuery) => ["cluster", "events", query] as const,
  rollingUpdates: (agentId?: string) => ["cluster", "rolling-updates", agentId ?? "all"] as const,
  // Phase 15 "Enterprise Platform, Multi-Tenant SaaS & Global Operations".
  organizations: ["organizations"] as const,
  organizationMembers: (organizationId: string) => ["organizations", organizationId, "members"] as const,
  teams: (organizationId: string) => ["teams", organizationId] as const,
  teamMembers: (teamId: string) => ["teams", teamId, "members"] as const,
  teamProjects: (teamId: string) => ["teams", teamId, "projects"] as const,
  teamNotificationSettings: (teamId: string) => ["teams", teamId, "notification-settings"] as const,
  apiKeys: (organizationId: string) => ["api-keys", organizationId] as const,
  serviceAccounts: (organizationId: string) => ["service-accounts", organizationId] as const,
  webhooks: (organizationId: string) => ["webhooks", organizationId] as const,
  webhookDeliveries: (webhookId: string) => ["webhooks", webhookId, "deliveries"] as const,
  platformOverview: ["platform", "overview"] as const,
  tenantAnalytics: (organizationId?: string, teamId?: string) => ["platform", "analytics", organizationId ?? "all", teamId ?? "all"] as const,
  platformUsage: (organizationId?: string) => ["platform", "usage", organizationId ?? "all"] as const,
  // Phase 19 "Enterprise Observability, API Analytics & Operational
  // Intelligence".
  apiAnalyticsOverview: (organizationId?: string) => ["platform", "api-analytics", "overview", organizationId ?? "all"] as const,
  apiAnalyticsTimeseries: (organizationId?: string, hours?: number, granularity?: string) =>
    ["platform", "api-analytics", "timeseries", organizationId ?? "all", hours ?? 24, granularity ?? "hour"] as const,
  apiKeyUsageDetail: (apiKeyId: string) => ["platform", "api-analytics", "keys", apiKeyId] as const,
  // Phase 20 "Enterprise API Governance, Developer Portal & Credential
  // Lifecycle".
  planLimits: (organizationId: string) => ["platform", "plan-limits", organizationId] as const,
  // Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service
  // Health".
  slos: (query: import("../api/slo.api").SlosQuery) => ["platform", "slo", query] as const,
  slo: (id: string) => ["platform", "slo", "detail", id] as const,
  sloHistory: (id: string, window: string) => ["platform", "slo", "detail", id, "history", window] as const,
  // Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
  // Intelligence".
  services: (query: import("../api/services.api").ServicesQuery) => ["platform", "services", query] as const,
  service: (id: string) => ["platform", "services", "detail", id] as const,
  // Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence".
  servicePortfolio: (organizationId: string, range: string) => ["platform", "services", "portfolio", organizationId, range] as const,
  serviceHealth: (id: string) => ["platform", "services", "detail", id, "health"] as const,
  serviceDependencies: (id: string) => ["platform", "services", "detail", id, "dependencies"] as const,
  serviceDependents: (id: string) => ["platform", "services", "detail", id, "dependents"] as const,
  serviceImpact: (id: string) => ["platform", "services", "detail", id, "impact"] as const,
  serviceCriticalPath: (id: string) => ["platform", "services", "detail", id, "critical-path"] as const,
  topology: (organizationId: string, teamId?: string) => ["platform", "topology", organizationId, teamId ?? "all"] as const,
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing".
  onCallSchedules: (query: import("../api/on-call.api").OnCallSchedulesQuery) => ["on-call", "schedules", query] as const,
  onCallSchedule: (id: string) => ["on-call", "schedules", "detail", id] as const,
  onCallScheduleMembers: (id: string) => ["on-call", "schedules", "detail", id, "members"] as const,
  onCallCurrent: (id: string) => ["on-call", "schedules", "detail", id, "current"] as const,
  onCallTimeline: (id: string, from?: string, hours?: number) => ["on-call", "schedules", "detail", id, "timeline", from ?? "now", hours ?? 336] as const,
  onCallOverrides: (id: string) => ["on-call", "schedules", "detail", id, "overrides"] as const,
  // Phase 26 "Enterprise Incident Postmortems & Retrospectives".
  postmortems: (query: import("../api/postmortems.api").PostmortemsQuery) => ["postmortems", query] as const,
  incidentPostmortem: (incidentId: string) => ["incidents", "detail", incidentId, "postmortem"] as const,
  // Phase 27 "Enterprise Deployment Tracking & Change Correlation".
  deployments: (projectId: string, query: import("../api/deployments.api").DeploymentsQuery) =>
    ["projects", projectId, "deployments", query] as const,
  incidentRecentDeployments: (incidentId: string) => ["incidents", "detail", incidentId, "recent-deployments"] as const,
  // Phase 27 "Enterprise On-Call & Escalation Management".
  escalationPolicies: (organizationId: string) => ["escalation-policies", organizationId] as const,
  escalationPolicy: (id: number) => ["escalation-policies", "detail", id] as const,
  incidentEscalation: (incidentId: string) => ["incidents", "detail", incidentId, "escalation"] as const,
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk".
  changes: (query: import("../api/changes.api").ChangesQuery) => ["changes", query] as const,
  change: (id: number) => ["changes", "detail", id] as const,
  changeImpact: (id: number) => ["changes", "detail", id, "impact"] as const,
  changeRelatedIncidents: (id: number) => ["changes", "detail", id, "related-incidents"] as const,
  changeMaintenanceWindows: (id: number) => ["changes", "detail", id, "maintenance-windows"] as const,
  changesForService: (serviceId: number) => ["changes", "for-service", serviceId] as const,
  changeAudit: (id: number) => ["changes", "detail", id, "audit"] as const,
  changeRisk: (id: number) => ["changes", "detail", id, "risk"] as const,
  incidentChangeContext: (incidentId: string) => ["incidents", "detail", incidentId, "change-context"] as const,
  incidentRecentChanges: (incidentId: string) => ["incidents", "detail", incidentId, "recent-changes"] as const,
  // Phase 30 "Enterprise Reliability, Automated Recovery & Operational Resilience".
  incidentRecoveryActions: (incidentId: string) => ["incidents", "detail", incidentId, "recovery-actions"] as const,
  // Phase 31 "Enterprise Change/Incident Communication & Stakeholder Notification Intelligence".
  incidentCommunications: (incidentId: string) => ["incidents", "detail", incidentId, "communications"] as const,
  // Phase 32 "Enterprise Incident Command Center & Operational Coordination".
  incidentCommand: (incidentId: string) => ["incidents", "detail", incidentId, "command"] as const,
  incidentCommandOverview: (incidentId: string) => ["incidents", "detail", incidentId, "command-overview"] as const,
  // Phase 33 "Enterprise Reliability Intelligence & Incident Learning" - ein
  // gemeinsames "reliability"-Praefix fuer alle 5 Endpunkte, damit
  // useRealtime.ts per Praefix invalidieren kann (siehe dort), statt jeden
  // einzeln aufzuzaehlen.
  reliabilityOverview: (params: import("../types/reliability.types").ReliabilityFilterParams) => ["reliability", "overview", params] as const,
  reliabilityTrends: (params: import("../types/reliability.types").ReliabilityFilterParams) => ["reliability", "trends", params] as const,
  reliabilityProjects: (params: import("../types/reliability.types").ReliabilityFilterParams) => ["reliability", "projects", params] as const,
  reliabilityRecurringIncidents: (params: import("../types/reliability.types").ReliabilityFilterParams) => ["reliability", "recurring-incidents", params] as const,
  reliabilityInsights: (params: import("../types/reliability.types").ReliabilityFilterParams) => ["reliability", "insights", params] as const,
  // Phase 35 "Enterprise Problem Management & Root-Cause Intelligence" - ein
  // gemeinsames "problems"-Praefix, damit useRealtime.ts bei PROBLEM_UPDATED
  // per Praefix invalidieren kann (siehe dort), statt jeden Endpunkt einzeln
  // aufzuzaehlen.
  problems: (params: import("../api/problems.api").ProblemsQuery) => ["problems", "list", params] as const,
  problem: (id: string) => ["problems", "detail", id] as const,
  problemCandidates: (params: import("../api/problems.api").ProblemCandidatesQuery) => ["problems", "candidates", params] as const,
  // Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence" -
  // unter demselben "problems"-Praefix (siehe hooks/useRealtime.ts
  // invalidateProblemsQueries), damit bestehende Incident-/Change-/SLO-
  // Events die Effectiveness-Analyse ohne ein neues Realtime-Event
  // mit-invalidieren.
  problemEffectiveness: (id: string, windowDays: number) => ["problems", "effectiveness", id, windowDays] as const,
  // Phase 37 "Enterprise Service Resilience & Dependency Intelligence" - ein
  // gemeinsames "resilience"-Praefix, damit useRealtime.ts per Praefix
  // invalidieren kann (siehe invalidateResilienceQueries dort), statt jeden
  // Endpunkt einzeln aufzuzaehlen.
  resilienceOverview: (params: import("../types/resilience.types").ResilienceOverviewParams) => ["resilience", "overview", params] as const,
  resilienceService: (projectId: string, range: string) => ["resilience", "service", projectId, range] as const,
  resilienceServiceDependencies: (projectId: string, range: string) => ["resilience", "service", projectId, "dependencies", range] as const,
  resilienceServiceSignals: (projectId: string, range: string) => ["resilience", "service", projectId, "signals", range] as const,
  // Phase 43 "Enterprise Operational Priority Intelligence" - unter
  // demselben "resilience"-Praefix wie oben.
  resiliencePriorityQueue: (params: import("../types/resilience.types").ResilienceOverviewParams) => ["resilience", "priority-queue", params] as const,
  // Phase 44 "Enterprise Priority Queue Acknowledgment Governance".
  resilienceAcknowledgment: (projectId: string) => ["resilience", "service", projectId, "acknowledgment"] as const,
  // Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
  // Intelligence" - ebenfalls unter dem "resilience"-Praefix (siehe oben).
  resilienceAcknowledgmentHistory: (projectId: string, range: string) => ["resilience", "service", projectId, "acknowledgment-history", range] as const,
  resilienceOutcomes: (params: import("../types/resilience.types").ResilienceOverviewParams) => ["resilience", "outcomes", params] as const,
  // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
  // ebenfalls unter dem "resilience"-Praefix (siehe oben).
  resilienceCapacityWatchlist: (params: import("../types/resilience.types").ResilienceOverviewParams) => ["resilience", "capacity-watchlist", params] as const,
  // Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
  // ebenfalls unter dem "resilience"-Praefix (siehe oben).
  resilienceBusinessImpact: (params: import("../types/resilience.types").ResilienceOverviewParams) => ["resilience", "business-impact", params] as const,
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
  // Intelligence" - ebenfalls unter dem "resilience"-Praefix (siehe oben).
  resilienceProactiveRiskAccuracy: (params: import("../types/resilience.types").ResilienceOverviewParams) => ["resilience", "proactive-risk-accuracy", params] as const,
  // Phase 50 "Enterprise Operational Decision & Executive Intelligence" -
  // ebenfalls unter dem "resilience"-Praefix (siehe oben).
  resilienceDecisionContext: (projectId: string, range: string) => ["resilience", "service", projectId, "decision-context", range] as const,
  // Phase 63 "Enterprise Operational Portfolio Intelligence" - ebenfalls
  // unter dem "resilience"-Praefix (siehe oben).
  resilienceOperationalState: (params: import("../types/resilience.types").ResilienceOverviewParams) => ["resilience", "operational-state", params] as const,
  // Phase 64 "Enterprise Operational Priority & Attention Management" -
  // ebenfalls unter dem "resilience"-Praefix (siehe oben).
  resilienceAttentionList: (params: import("../api/resilience.api").AttentionListParams) => ["resilience", "attention-list", params] as const,
  // Todo-Panel unter KI-Buero.
  todos: (projectId?: string) => ["todos", projectId ?? "all"] as const,
};
