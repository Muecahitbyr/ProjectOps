import type { CheckStatus, HealthStatus } from "./common.types";
import type { Todo } from "./todo.types";
import type { Incident } from "./incident.types";
import type { ProjectHealthSummary } from "./dashboard.types";
import type { AlertEvent, AlertRule } from "./alert.types";
import type { MaintenanceWindow } from "./maintenance.types";
import type { AutomationAction, AutomationExecution, AutomationLog, AutomationRule } from "./automation.types";
import type { MonitoringAgent } from "./monitoring-agent.types";
import type { SystemBackup } from "./backup.types";
import type { AuditLogEntry } from "./audit.types";
import type { ForecastMetric } from "./forecast.types";
import type { ClusterEvent } from "./cluster-event.types";
import type { AgentLogEntry } from "./agent-log.types";
import type { Organization } from "./organization.types";
import type { Team } from "./team.types";
import type { ApiKey } from "./api-key.types";
import type { ServiceAccount } from "./service-account.types";
import type { Slo } from "./slo.types";
import type { Service, ServiceDependency } from "./service.types";
import type { OnCallSchedule, OnCallOverride } from "./on-call.types";
import type { IncidentPostmortem } from "./postmortem.types";
import type { ResilienceStatus } from "./resilience.types";
import type { Deployment } from "./deployment.types";
import type { Change } from "./change.types";
import type { IncidentCommunication } from "./incident-communication.types";

// Spiegelt src/realtime/events.ts im Backend - Wire-Format ist identisch
// (JSON.stringify eines RealtimeEvent). Ids, die im Backend aus
// BIGSERIAL-Spalten stammen (incidentId, ai_analysis.id), sind hier bewusst
// "string" statt "number" - der pg-Treiber serialisiert BIGINT/BIGSERIAL als
// String, siehe Kommentar in incident.types.ts.
//
// Als String-Union statt "enum" (wie DashboardEventType in event.types.ts) -
// das Frontend-tsconfig hat erasableSyntaxOnly aktiv, echte Enums sind dort
// nicht erlaubt.
export type RealtimeEventType =
  | "CHECK_UPDATED"
  | "PROJECT_UPDATED"
  | "INCIDENT_CREATED"
  | "INCIDENT_RESOLVED"
  | "NOTIFICATION_SENT"
  | "AI_ANALYSIS_CREATED"
  | "HEALTH_CHANGED"
  | "TIMELINE_UPDATED"
  | "USER_ONLINE"
  | "USER_OFFLINE"
  | "ALERT_CREATED"
  | "ALERT_UPDATED"
  | "ALERT_TRIGGERED"
  | "ALERT_DEACTIVATED"
  | "ALERT_ESCALATED"
  | "ALERT_SUPPRESSED"
  | "MAINTENANCE_STARTED"
  | "MAINTENANCE_ENDED"
  | "INCIDENT_CORRELATED"
  | "AUTOMATION_STARTED"
  | "AUTOMATION_FINISHED"
  | "AUTOMATION_FAILED"
  | "AUTOMATION_WAITING_APPROVAL"
  | "AUTOMATION_APPROVED"
  | "AUTOMATION_REJECTED"
  | "SELF_HEALING_STARTED"
  | "SELF_HEALING_FINISHED"
  | "SELF_HEALING_FAILED"
  | "EXECUTION_LOG"
  | "AGENT_ONLINE"
  | "AGENT_OFFLINE"
  | "AGENT_HEARTBEAT"
  | "BACKUP_STARTED"
  | "BACKUP_FINISHED"
  | "RESTORE_STARTED"
  | "RESTORE_FINISHED"
  | "STATUSPAGE_UPDATED"
  | "AUDIT_CREATED"
  | "FORECAST_UPDATED"
  | "AGENT_REGISTERED"
  | "AGENT_UPDATED"
  | "AGENT_REMOVED"
  | "AGENT_PAUSED"
  | "AGENT_RESUMED"
  | "CHECK_REASSIGNED"
  | "FAILOVER_STARTED"
  | "FAILOVER_FINISHED"
  | "CLUSTER_UPDATED"
  | "ROLLING_UPDATE_STARTED"
  | "ROLLING_UPDATE_FINISHED"
  | "AGENT_LOG_CREATED"
  | "ORGANIZATION_CREATED"
  | "ORGANIZATION_UPDATED"
  | "TEAM_CREATED"
  | "TEAM_UPDATED"
  | "API_KEY_CREATED"
  | "API_KEY_REVOKED"
  | "SERVICE_ACCOUNT_CREATED"
  | "WEBHOOK_DELIVERED"
  | "WEBHOOK_FAILED"
  | "TENANT_UPDATED"
  | "API_QUOTA_WARNING"
  | "API_QUOTA_EXCEEDED"
  | "API_KEY_ROTATED"
  | "API_KEY_EXPIRED"
  | "API_USAGE_UPDATED"
  | "ALERT_DELETED"
  | "API_AUTOMATION_EXECUTION_REQUESTED"
  | "AUTOMATION_RULE_CREATED"
  | "AUTOMATION_RULE_UPDATED"
  | "AUTOMATION_RULE_DELETED"
  | "API_USAGE_THRESHOLD_WARNING"
  | "API_USAGE_SPIKE_DETECTED"
  // Phase 21 "Enterprise Alerting, Incident Response & Notification
  // Orchestration" - INCIDENT_CREATED/RESOLVED/NOTIFICATION_SENT/
  // AUTOMATION_STARTED/AUTOMATION_FINISHED existierten bereits und werden
  // wiederverwendet (siehe Abschlussbericht); nur diese 3 sind neu.
  | "INCIDENT_UPDATED"
  | "INCIDENT_ACKNOWLEDGED"
  | "INCIDENT_REOPENED"
  // Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service
  // Health".
  | "SLO_BREACHED"
  | "SLO_RECOVERED"
  | "SLO_BURN_RATE_WARNING"
  // Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
  // Intelligence".
  | "SERVICE_CREATED"
  | "SERVICE_UPDATED"
  | "SERVICE_DELETED"
  | "DEPENDENCY_CREATED"
  | "DEPENDENCY_DELETED"
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing".
  | "ON_CALL_SCHEDULE_CREATED"
  | "ON_CALL_SCHEDULE_UPDATED"
  | "ON_CALL_SCHEDULE_DELETED"
  | "ON_CALL_OVERRIDE_CREATED"
  | "ON_CALL_OVERRIDE_DELETED"
  // Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis".
  | "SERVICE_IMPACT_DETECTED"
  // Phase 26 "Enterprise Incident Postmortems & Retrospectives".
  | "INCIDENT_POSTMORTEM_CREATED"
  | "INCIDENT_POSTMORTEM_UPDATED"
  | "INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED"
  | "INCIDENT_POSTMORTEM_SUGGESTED"
  // Phase 27 "Enterprise Deployment Tracking & Change Correlation".
  | "DEPLOYMENT_CREATED"
  | "DEPLOYMENT_DELETED"
  // Phase 27 "Enterprise On-Call & Escalation Management".
  | "ONCALL_ESCALATION_STARTED"
  | "ONCALL_ESCALATION_LEVEL_CHANGED"
  | "ONCALL_ESCALATION_RESOLVED"
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - kein CHANGE_DELETED (Loeschen ist nur im DRAFT-
  // Status moeglich, seltene Admin-Aktion, siehe Backend-Kommentar in
  // realtime/events.ts).
  | "CHANGE_CREATED"
  | "CHANGE_UPDATED"
  | "CHANGE_STARTED"
  | "CHANGE_COMPLETED"
  | "CHANGE_CANCELLED"
  | "CHANGE_APPROVED"
  | "CHANGE_REJECTED"
  // Phase 28 (Fortsetzung) "Enterprise Change Management & Deployment
  // Intelligence" - neuer Endzustand "War die Aenderung erfolgreich?".
  | "CHANGE_FAILED"
  // Phase 31 "Enterprise Change/Incident Communication & Stakeholder
  // Notification Intelligence".
  | "INCIDENT_COMMUNICATION_CREATED"
  | "INCIDENT_COMMAND_UPDATED"
  // Phase 35 "Enterprise Problem Management & Root-Cause Intelligence".
  | "PROBLEM_UPDATED"
  // Phase 38 "Enterprise Resilience Alerting & Notification Intelligence".
  | "RESILIENCE_STATUS_CHANGED"
  | "TODO_UPDATED";

export const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = [
  "CHECK_UPDATED",
  "PROJECT_UPDATED",
  "INCIDENT_CREATED",
  "INCIDENT_RESOLVED",
  "NOTIFICATION_SENT",
  "AI_ANALYSIS_CREATED",
  "HEALTH_CHANGED",
  "TIMELINE_UPDATED",
  "USER_ONLINE",
  "USER_OFFLINE",
  "ALERT_CREATED",
  "ALERT_UPDATED",
  "ALERT_TRIGGERED",
  "ALERT_DEACTIVATED",
  "ALERT_ESCALATED",
  "ALERT_SUPPRESSED",
  "MAINTENANCE_STARTED",
  "MAINTENANCE_ENDED",
  "INCIDENT_CORRELATED",
  "AUTOMATION_STARTED",
  "AUTOMATION_FINISHED",
  "AUTOMATION_FAILED",
  "AUTOMATION_WAITING_APPROVAL",
  "AUTOMATION_APPROVED",
  "AUTOMATION_REJECTED",
  "SELF_HEALING_STARTED",
  "SELF_HEALING_FINISHED",
  "SELF_HEALING_FAILED",
  "EXECUTION_LOG",
  "AGENT_ONLINE",
  "AGENT_OFFLINE",
  "AGENT_HEARTBEAT",
  "BACKUP_STARTED",
  "BACKUP_FINISHED",
  "RESTORE_STARTED",
  "RESTORE_FINISHED",
  "STATUSPAGE_UPDATED",
  "AUDIT_CREATED",
  "FORECAST_UPDATED",
  "AGENT_REGISTERED",
  "AGENT_UPDATED",
  "AGENT_REMOVED",
  "AGENT_PAUSED",
  "AGENT_RESUMED",
  "CHECK_REASSIGNED",
  "FAILOVER_STARTED",
  "FAILOVER_FINISHED",
  "CLUSTER_UPDATED",
  "ROLLING_UPDATE_STARTED",
  "ROLLING_UPDATE_FINISHED",
  "AGENT_LOG_CREATED",
  "ORGANIZATION_CREATED",
  "ORGANIZATION_UPDATED",
  "TEAM_CREATED",
  "TEAM_UPDATED",
  "API_KEY_CREATED",
  "API_KEY_REVOKED",
  "SERVICE_ACCOUNT_CREATED",
  "WEBHOOK_DELIVERED",
  "WEBHOOK_FAILED",
  "TENANT_UPDATED",
  "API_QUOTA_WARNING",
  "API_QUOTA_EXCEEDED",
  "API_KEY_ROTATED",
  "API_KEY_EXPIRED",
  "API_USAGE_UPDATED",
  "ALERT_DELETED",
  "API_AUTOMATION_EXECUTION_REQUESTED",
  "AUTOMATION_RULE_CREATED",
  "AUTOMATION_RULE_UPDATED",
  "AUTOMATION_RULE_DELETED",
  "API_USAGE_THRESHOLD_WARNING",
  "API_USAGE_SPIKE_DETECTED",
  "INCIDENT_UPDATED",
  "INCIDENT_ACKNOWLEDGED",
  "INCIDENT_REOPENED",
  "SLO_BREACHED",
  "SLO_RECOVERED",
  "SLO_BURN_RATE_WARNING",
  "SERVICE_CREATED",
  "SERVICE_UPDATED",
  "SERVICE_DELETED",
  "DEPENDENCY_CREATED",
  "DEPENDENCY_DELETED",
  "ON_CALL_SCHEDULE_CREATED",
  "ON_CALL_SCHEDULE_UPDATED",
  "ON_CALL_SCHEDULE_DELETED",
  "ON_CALL_OVERRIDE_CREATED",
  "ON_CALL_OVERRIDE_DELETED",
  "SERVICE_IMPACT_DETECTED",
  "INCIDENT_POSTMORTEM_CREATED",
  "INCIDENT_POSTMORTEM_UPDATED",
  "INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED",
  "INCIDENT_POSTMORTEM_SUGGESTED",
  "DEPLOYMENT_CREATED",
  "DEPLOYMENT_DELETED",
  "ONCALL_ESCALATION_STARTED",
  "ONCALL_ESCALATION_LEVEL_CHANGED",
  "ONCALL_ESCALATION_RESOLVED",
  "CHANGE_CREATED",
  "CHANGE_UPDATED",
  "CHANGE_STARTED",
  "CHANGE_COMPLETED",
  "CHANGE_CANCELLED",
  "CHANGE_APPROVED",
  "CHANGE_REJECTED",
  "CHANGE_FAILED",
  "INCIDENT_COMMUNICATION_CREATED",
  "INCIDENT_COMMAND_UPDATED",
  "PROBLEM_UPDATED",
  "RESILIENCE_STATUS_CHANGED",
  "TODO_UPDATED",
];

export interface RealtimeCheckResult {
  checkId: string;
  projectId: string;
  type: string;
  status: CheckStatus;
  statusCode?: number;
  responseTimeMs?: number;
  error?: string;
  checkedAt: string;
}

export interface NotificationSentPayload {
  projectId: string;
  checkId: string;
  incidentId: string | null;
  channel: string;
  status: "SENT" | "FAILED" | "PENDING";
  error?: string;
}

export interface AiAnalysisCreatedPayload {
  id: string;
  incidentId: string;
  projectId: string;
  checkId: string;
  summary: string;
  rootCause: string;
  recommendation: string;
  affectedSystems: string[] | null;
  recommendedSteps: string[] | null;
  confidenceScore: number | null;
  createdAt: string;
}

export interface HealthChangedPayload {
  status: HealthStatus;
  previousStatus: HealthStatus;
}

export interface TimelineUpdatedPayload {
  generatedAt: string;
}

export interface UserPresencePayload {
  userId: string;
  lastActiveAt: string;
}

export interface AlertEscalatedPayload {
  alertEvent: AlertEvent;
  stepOrder: number;
  channelId: string;
}

export interface IncidentCorrelatedPayload {
  rootIncidentId: string;
  causeCheckType: string;
  affectedProjectIds: string[];
  isNew: boolean;
}

export interface AutomationExecutionPayload {
  action: AutomationAction;
  execution: AutomationExecution;
}

export interface AutomationApprovalPayload {
  action: AutomationAction;
  userId: string;
}

export interface BackupStartedPayload {
  backupId: string;
  label: string;
}

export interface RestoreStartedPayload {
  backupId: string;
}

export interface RestoreFinishedPayload {
  backupId: string;
  restoredAt: string;
}

export interface StatusPageUpdatedPayload {
  generatedAt: string;
}

export interface ForecastUpdatedPayload {
  metric: ForecastMetric;
  generatedAt: string;
}

export interface AgentRemovedPayload {
  agentId: string;
  agentName: string;
}

export interface ClusterUpdatedPayload {
  message: string;
  generatedAt: string;
}

export interface ApiKeyRevokedPayload {
  apiKeyId: string;
  organizationId: string;
}

export interface WebhookDeliveredPayload {
  webhookId: string;
  deliveryId: string;
  eventType: string;
  responseStatus: number;
}

export interface WebhookFailedPayload {
  webhookId: string;
  deliveryId: string;
  eventType: string;
  error: string;
}

export interface TenantUpdatedPayload {
  organizationId: string;
  generatedAt: string;
}

export interface ApiQuotaEventPayload {
  organizationId: string;
  apiKeyId: string;
  thresholdPercent: number;
  requestsToday: number;
  dailyLimit: number;
}

export interface ApiKeyLifecycleEventPayload {
  apiKeyId: string;
  organizationId: string;
}

export interface ApiUsageUpdatedPayload {
  organizationId: string;
  requestsToday: number;
}

export interface AlertDeletedPayload {
  id: number;
  projectId: string;
  name: string;
}

export interface AutomationRuleDeletedPayload {
  id: number;
  projectId: string;
  name: string;
}

export interface ApiUsageIntelligencePayload {
  organizationId: string;
  thresholdPercent: number;
  recentRequests: number;
  windowMinutes: number;
}

export interface PostmortemActionItemUpdatedPayload {
  postmortemId: number;
  incidentId: number;
  actionItemId: number;
}

export interface PostmortemSuggestedPayload {
  incidentId: number;
  incidentTitle: string;
  severity: string;
}

export interface IncidentEscalationEventPayload {
  incidentId: number;
  projectId: string;
  escalationPolicyId: number;
  stepOrder: number;
  targetType: "USER" | "ON_CALL_SCHEDULE";
  targetUserId: string | null;
  targetUserName: string | null;
}

export interface IncidentEscalationResolvedPayload {
  incidentId: number;
  projectId: string;
  escalationPolicyId: number;
  finalStepOrder: number;
}

export type RealtimeEvent =
  | { type: "CHECK_UPDATED"; timestamp: string; payload: RealtimeCheckResult }
  | { type: "PROJECT_UPDATED"; timestamp: string; payload: ProjectHealthSummary }
  | { type: "INCIDENT_CREATED"; timestamp: string; payload: Incident }
  | { type: "INCIDENT_RESOLVED"; timestamp: string; payload: Incident }
  | { type: "NOTIFICATION_SENT"; timestamp: string; payload: NotificationSentPayload }
  | { type: "AI_ANALYSIS_CREATED"; timestamp: string; payload: AiAnalysisCreatedPayload }
  | { type: "HEALTH_CHANGED"; timestamp: string; payload: HealthChangedPayload }
  | { type: "TIMELINE_UPDATED"; timestamp: string; payload: TimelineUpdatedPayload }
  | { type: "USER_ONLINE"; timestamp: string; payload: UserPresencePayload }
  | { type: "USER_OFFLINE"; timestamp: string; payload: UserPresencePayload }
  | { type: "ALERT_CREATED"; timestamp: string; payload: AlertRule }
  | { type: "ALERT_UPDATED"; timestamp: string; payload: AlertRule }
  | { type: "ALERT_TRIGGERED"; timestamp: string; payload: AlertRule }
  | { type: "ALERT_DEACTIVATED"; timestamp: string; payload: AlertRule }
  | { type: "ALERT_ESCALATED"; timestamp: string; payload: AlertEscalatedPayload }
  | { type: "ALERT_SUPPRESSED"; timestamp: string; payload: AlertEvent }
  | { type: "MAINTENANCE_STARTED"; timestamp: string; payload: MaintenanceWindow }
  | { type: "MAINTENANCE_ENDED"; timestamp: string; payload: MaintenanceWindow }
  | { type: "INCIDENT_CORRELATED"; timestamp: string; payload: IncidentCorrelatedPayload }
  | { type: "AUTOMATION_STARTED"; timestamp: string; payload: AutomationExecutionPayload }
  | { type: "AUTOMATION_FINISHED"; timestamp: string; payload: AutomationExecutionPayload }
  | { type: "AUTOMATION_FAILED"; timestamp: string; payload: AutomationExecutionPayload }
  | { type: "AUTOMATION_WAITING_APPROVAL"; timestamp: string; payload: AutomationAction }
  | { type: "AUTOMATION_APPROVED"; timestamp: string; payload: AutomationApprovalPayload }
  | { type: "AUTOMATION_REJECTED"; timestamp: string; payload: AutomationApprovalPayload }
  | { type: "SELF_HEALING_STARTED"; timestamp: string; payload: AutomationExecutionPayload }
  | { type: "SELF_HEALING_FINISHED"; timestamp: string; payload: AutomationExecutionPayload }
  | { type: "SELF_HEALING_FAILED"; timestamp: string; payload: AutomationExecutionPayload }
  | { type: "EXECUTION_LOG"; timestamp: string; payload: AutomationLog }
  | { type: "AGENT_ONLINE"; timestamp: string; payload: MonitoringAgent }
  | { type: "AGENT_OFFLINE"; timestamp: string; payload: MonitoringAgent }
  | { type: "AGENT_HEARTBEAT"; timestamp: string; payload: MonitoringAgent }
  | { type: "BACKUP_STARTED"; timestamp: string; payload: BackupStartedPayload }
  | { type: "BACKUP_FINISHED"; timestamp: string; payload: SystemBackup }
  | { type: "RESTORE_STARTED"; timestamp: string; payload: RestoreStartedPayload }
  | { type: "RESTORE_FINISHED"; timestamp: string; payload: RestoreFinishedPayload }
  | { type: "STATUSPAGE_UPDATED"; timestamp: string; payload: StatusPageUpdatedPayload }
  | { type: "AUDIT_CREATED"; timestamp: string; payload: AuditLogEntry }
  | { type: "FORECAST_UPDATED"; timestamp: string; payload: ForecastUpdatedPayload }
  | { type: "AGENT_REGISTERED"; timestamp: string; payload: MonitoringAgent }
  | { type: "AGENT_UPDATED"; timestamp: string; payload: MonitoringAgent }
  | { type: "AGENT_REMOVED"; timestamp: string; payload: AgentRemovedPayload }
  | { type: "AGENT_PAUSED"; timestamp: string; payload: MonitoringAgent }
  | { type: "AGENT_RESUMED"; timestamp: string; payload: MonitoringAgent }
  | { type: "CHECK_REASSIGNED"; timestamp: string; payload: ClusterEvent }
  | { type: "FAILOVER_STARTED"; timestamp: string; payload: ClusterEvent }
  | { type: "FAILOVER_FINISHED"; timestamp: string; payload: ClusterEvent }
  | { type: "CLUSTER_UPDATED"; timestamp: string; payload: ClusterUpdatedPayload }
  | { type: "ROLLING_UPDATE_STARTED"; timestamp: string; payload: ClusterEvent }
  | { type: "ROLLING_UPDATE_FINISHED"; timestamp: string; payload: ClusterEvent }
  | { type: "AGENT_LOG_CREATED"; timestamp: string; payload: AgentLogEntry }
  | { type: "ORGANIZATION_CREATED"; timestamp: string; payload: Organization }
  | { type: "ORGANIZATION_UPDATED"; timestamp: string; payload: Organization }
  | { type: "TEAM_CREATED"; timestamp: string; payload: Team }
  | { type: "TEAM_UPDATED"; timestamp: string; payload: Team }
  | { type: "API_KEY_CREATED"; timestamp: string; payload: ApiKey }
  | { type: "API_KEY_REVOKED"; timestamp: string; payload: ApiKeyRevokedPayload }
  | { type: "SERVICE_ACCOUNT_CREATED"; timestamp: string; payload: ServiceAccount }
  | { type: "WEBHOOK_DELIVERED"; timestamp: string; payload: WebhookDeliveredPayload }
  | { type: "WEBHOOK_FAILED"; timestamp: string; payload: WebhookFailedPayload }
  | { type: "TENANT_UPDATED"; timestamp: string; payload: TenantUpdatedPayload }
  | { type: "API_QUOTA_WARNING"; timestamp: string; payload: ApiQuotaEventPayload }
  | { type: "API_QUOTA_EXCEEDED"; timestamp: string; payload: ApiQuotaEventPayload }
  | { type: "API_KEY_ROTATED"; timestamp: string; payload: ApiKey }
  | { type: "API_KEY_EXPIRED"; timestamp: string; payload: ApiKeyLifecycleEventPayload }
  | { type: "API_USAGE_UPDATED"; timestamp: string; payload: ApiUsageUpdatedPayload }
  | { type: "ALERT_DELETED"; timestamp: string; payload: AlertDeletedPayload }
  | { type: "API_AUTOMATION_EXECUTION_REQUESTED"; timestamp: string; payload: AutomationAction }
  | { type: "AUTOMATION_RULE_CREATED"; timestamp: string; payload: AutomationRule }
  | { type: "AUTOMATION_RULE_UPDATED"; timestamp: string; payload: AutomationRule }
  | { type: "AUTOMATION_RULE_DELETED"; timestamp: string; payload: AutomationRuleDeletedPayload }
  | { type: "API_USAGE_THRESHOLD_WARNING"; timestamp: string; payload: ApiUsageIntelligencePayload }
  | { type: "API_USAGE_SPIKE_DETECTED"; timestamp: string; payload: ApiUsageIntelligencePayload }
  | { type: "INCIDENT_UPDATED"; timestamp: string; payload: Incident }
  | { type: "INCIDENT_ACKNOWLEDGED"; timestamp: string; payload: Incident }
  | { type: "INCIDENT_REOPENED"; timestamp: string; payload: Incident }
  | { type: "SLO_BREACHED"; timestamp: string; payload: SloEvaluationEventPayload }
  | { type: "SLO_RECOVERED"; timestamp: string; payload: SloEvaluationEventPayload }
  | { type: "SLO_BURN_RATE_WARNING"; timestamp: string; payload: SloEvaluationEventPayload }
  | { type: "SERVICE_CREATED"; timestamp: string; payload: Service }
  | { type: "SERVICE_UPDATED"; timestamp: string; payload: Service }
  | { type: "SERVICE_DELETED"; timestamp: string; payload: { id: number; organizationId: string; name: string } }
  | { type: "DEPENDENCY_CREATED"; timestamp: string; payload: ServiceDependency }
  | { type: "DEPENDENCY_DELETED"; timestamp: string; payload: { id: number; organizationId: string } }
  | { type: "ON_CALL_SCHEDULE_CREATED"; timestamp: string; payload: OnCallSchedule }
  | { type: "ON_CALL_SCHEDULE_UPDATED"; timestamp: string; payload: OnCallSchedule }
  | { type: "ON_CALL_SCHEDULE_DELETED"; timestamp: string; payload: { id: number; organizationId: string; name: string } }
  | { type: "ON_CALL_OVERRIDE_CREATED"; timestamp: string; payload: OnCallOverride }
  | { type: "ON_CALL_OVERRIDE_DELETED"; timestamp: string; payload: { id: number; scheduleId: number; organizationId: string } }
  | {
      type: "SERVICE_IMPACT_DETECTED";
      timestamp: string;
      payload: { serviceId: number; serviceName: string; organizationId: string; affectedCount: number; trigger: "INCIDENT" | "SLO_BREACH" | "ALERT"; triggerLabel: string };
    }
  | { type: "INCIDENT_POSTMORTEM_CREATED"; timestamp: string; payload: IncidentPostmortem }
  | { type: "INCIDENT_POSTMORTEM_UPDATED"; timestamp: string; payload: IncidentPostmortem }
  | { type: "INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED"; timestamp: string; payload: PostmortemActionItemUpdatedPayload }
  | { type: "INCIDENT_POSTMORTEM_SUGGESTED"; timestamp: string; payload: PostmortemSuggestedPayload }
  | { type: "DEPLOYMENT_CREATED"; timestamp: string; payload: Deployment }
  | { type: "DEPLOYMENT_DELETED"; timestamp: string; payload: { id: number; projectId: string } }
  | { type: "ONCALL_ESCALATION_STARTED"; timestamp: string; payload: IncidentEscalationEventPayload }
  | { type: "ONCALL_ESCALATION_LEVEL_CHANGED"; timestamp: string; payload: IncidentEscalationEventPayload }
  | { type: "ONCALL_ESCALATION_RESOLVED"; timestamp: string; payload: IncidentEscalationResolvedPayload }
  | { type: "CHANGE_CREATED"; timestamp: string; payload: Change }
  | { type: "CHANGE_UPDATED"; timestamp: string; payload: Change }
  | { type: "CHANGE_STARTED"; timestamp: string; payload: Change }
  | { type: "CHANGE_COMPLETED"; timestamp: string; payload: Change }
  | { type: "CHANGE_CANCELLED"; timestamp: string; payload: Change }
  | { type: "CHANGE_APPROVED"; timestamp: string; payload: Change }
  | { type: "CHANGE_REJECTED"; timestamp: string; payload: Change }
  | { type: "CHANGE_FAILED"; timestamp: string; payload: Change }
  | { type: "INCIDENT_COMMUNICATION_CREATED"; timestamp: string; payload: IncidentCommunication }
  | { type: "INCIDENT_COMMAND_UPDATED"; timestamp: string; payload: { incidentId: string } }
  | { type: "PROBLEM_UPDATED"; timestamp: string; payload: { problemId: string; organizationId: string } }
  | {
      type: "RESILIENCE_STATUS_CHANGED";
      timestamp: string;
      payload: {
        projectId: string;
        projectName: string;
        organizationId: string;
        serviceId: number | null;
        serviceName: string | null;
        previousStatus: ResilienceStatus | null;
        newStatus: ResilienceStatus;
      };
    }
  | { type: "TODO_UPDATED"; timestamp: string; payload: Todo };

export interface SloEvaluationEventPayload {
  slo: Slo;
  sliValue: number;
  burnRate: number;
  errorBudgetRemainingPercent: number;
}

export type RealtimeConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";
