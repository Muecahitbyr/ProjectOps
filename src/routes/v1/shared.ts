import type { Request } from "express";
import type { ProjectHealthSummary } from "../../db/dashboard.repository";
import { deriveIncidentStatus } from "../../types/incident.types";
import type { Incident } from "../../types/incident.types";
import type { AlertRule } from "../../types/alert.types";
import type { AutomationAction, AutomationExecution, AutomationLog, AutomationRule } from "../../types/automation.types";
import { deriveApiKeyStatus } from "../../types/api-key.types";
import type { ApiKey, ApiKeyStatus } from "../../types/api-key.types";
import type { PostmortemActionItem, PostmortemWithActionItems } from "../../types/postmortem.types";
import type { Deployment } from "../../types/deployment.types";
import type { IncidentEscalationStatus } from "../../types/escalation-policy.types";
import type { IncidentCommunication } from "../../types/incident-communication.types";

// Phase 16 (2. Iteration) Auftragspunkt 3 "Oeffentliche API" - eigene,
// externe DTOs statt interne Repository-Typen direkt zu serialisieren:
// entkoppelt den externen API-Vertrag von internen Datenstrukturen (ein
// interner Refactor darf die externe API nicht stillschweigend brechen)
// und stellt sicher, dass nie versehentlich interne Felder (z.B.
// createdBy-Benutzer-ids) nach aussen geraten.

export interface ProjectDto {
  id: string;
  name: string;
  type: string;
  health: { status: string; score: number };
  checks: { total: number; online: number; warning: number; error: number };
  openIncidents: number;
}

export function toProjectDto(project: ProjectHealthSummary): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    health: { status: project.health.status, score: project.health.score },
    checks: { ...project.checks },
    openIncidents: project.openIncidents,
  };
}

// Phase 21 Auftragspunkt 11 "Incident API" - status ist die abgeleitete
// OPEN/ACKNOWLEDGED/RESOLVED-Ansicht (siehe deriveIncidentStatus()), keine
// neue Information. acknowledgedBy/assigneeId bewusst NICHT Teil der DTO -
// interne Benutzer-ids, dasselbe Prinzip wie createdBy bei jeder anderen
// externen DTO in diesem System (AutomationRuleDto/AlertDto/ApiKeyDto/...).
export interface IncidentDto {
  id: number;
  projectId: string;
  checkId: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  resolutionReason: string | null;
}

export function toIncidentDto(incident: Incident): IncidentDto {
  return {
    id: incident.id,
    projectId: incident.projectId,
    checkId: incident.checkId,
    severity: incident.severity,
    title: incident.title,
    description: incident.description,
    status: deriveIncidentStatus(incident),
    resolved: incident.resolved,
    createdAt: incident.createdAt,
    resolvedAt: incident.resolvedAt,
    acknowledgedAt: incident.acknowledgedAt,
    resolutionReason: incident.resolutionReason,
  };
}

// Phase 26 Auftragspunkt 6 "Externe API" - createdBy/assigneeId (interne
// Benutzer-ids) bewusst NICHT Teil der DTO, gleiches Prinzip wie bei jeder
// anderen externen DTO in diesem System.
export interface PostmortemActionItemDto {
  id: number;
  description: string;
  dueDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostmortemDto {
  id: number;
  incidentId: number;
  status: string;
  summary: string | null;
  impact: string | null;
  rootCause: string | null;
  resolution: string | null;
  timelineNotes: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  actionItems: PostmortemActionItemDto[];
}

export function toPostmortemActionItemDto(item: PostmortemActionItem): PostmortemActionItemDto {
  return {
    id: item.id,
    description: item.description,
    dueDate: item.dueDate,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function toPostmortemDto(postmortem: PostmortemWithActionItems): PostmortemDto {
  return {
    id: postmortem.id,
    incidentId: postmortem.incidentId,
    status: postmortem.status,
    summary: postmortem.summary,
    impact: postmortem.impact,
    rootCause: postmortem.rootCause,
    resolution: postmortem.resolution,
    timelineNotes: postmortem.timelineNotes,
    publishedAt: postmortem.publishedAt,
    createdAt: postmortem.createdAt,
    updatedAt: postmortem.updatedAt,
    actionItems: postmortem.actionItems.map(toPostmortemActionItemDto),
  };
}

// Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
// deployedBy (interne Benutzer-id) bewusst NICHT Teil der DTO, gleiches
// Prinzip wie bei jeder anderen externen DTO in diesem System.
export interface DeploymentDto {
  id: number;
  projectId: string;
  environment: string;
  version: string;
  status: string;
  description: string | null;
  deployedAt: string;
  createdAt: string;
}

export function toDeploymentDto(deployment: Deployment): DeploymentDto {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    environment: deployment.environment,
    version: deployment.version,
    status: deployment.status,
    description: deployment.description,
    deployedAt: deployment.deployedAt,
    createdAt: deployment.createdAt,
  };
}

// Phase 27 "Enterprise On-Call & Escalation Management" - read-only DTO
// fuer GET /v1/incidents/:id/escalation. Policy-Steps enthalten bewusst
// keine internen Details ausser dem aufgeloesten Ziel (targetUserId ist
// bereits bei on_call/schedules/:id/current, Phase 24, Teil der externen
// API - kein neues Datenschutzproblem).
export interface EscalationStatusDto {
  policyId: number | null;
  policyName: string | null;
  currentStepOrder: number;
  currentTarget: { stepOrder: number; targetType: string; userId: string | null; userName: string | null } | null;
  nextStep: { stepOrder: number; delayMinutes: number; dueAt: string } | null;
}

export function toEscalationStatusDto(status: IncidentEscalationStatus): EscalationStatusDto {
  return {
    policyId: status.policy?.id ?? null,
    policyName: status.policy?.name ?? null,
    currentStepOrder: status.currentStepOrder,
    currentTarget: status.currentTarget
      ? {
          stepOrder: status.currentTarget.stepOrder,
          targetType: status.currentTarget.targetType,
          userId: status.currentTarget.userId,
          userName: status.currentTarget.userName,
        }
      : null,
    nextStep: status.nextStep,
  };
}

// createdBy (interne Benutzer-id) bewusst NICHT Teil der DTO - externe
// API-Konsumenten haben keinen Bezug zu internen Benutzer-ids.
export interface AlertDto {
  id: number;
  projectId: string;
  name: string;
  ruleType: string;
  severity: string;
  metric: string;
  comparator: string;
  threshold: number | null;
  windowMinutes: number | null;
  enabled: boolean;
  currentlyTriggered: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toAlertDto(rule: AlertRule): AlertDto {
  return {
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    ruleType: rule.ruleType,
    severity: rule.severity,
    metric: rule.metric,
    comparator: rule.comparator,
    threshold: rule.threshold,
    windowMinutes: rule.windowMinutes,
    enabled: rule.enabled,
    currentlyTriggered: rule.currentlyTriggered,
    lastTriggeredAt: rule.lastTriggeredAt,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

// Phase 17 Auftragspunkt 6/8 "Alert DTOs"/"Automation Read API" - keine
// internen Felder (insbesondere approvedBy/executedBy, interne
// Benutzer-ids) in den externen DTOs.
export interface AutomationActionDto {
  id: number;
  projectId: string;
  incidentId: number | null;
  ruleId: number | null;
  action: string;
  trigger: string;
  context: AutomationAction["context"];
  status: string;
  createdAt: string;
}

export function toAutomationActionDto(action: AutomationAction): AutomationActionDto {
  return {
    id: action.id,
    projectId: action.projectId,
    incidentId: action.incidentId,
    ruleId: action.ruleId,
    action: action.action,
    trigger: action.trigger,
    context: action.context,
    status: action.status,
    createdAt: action.createdAt,
  };
}

export interface AutomationExecutionDto {
  id: number;
  automationActionId: number;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  dryRun: boolean;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export function toAutomationExecutionDto(execution: AutomationExecution): AutomationExecutionDto {
  return {
    id: execution.id,
    automationActionId: execution.automationActionId,
    status: execution.status,
    result: execution.result,
    error: execution.error,
    dryRun: execution.dryRun,
    stdout: execution.stdout,
    stderr: execution.stderr,
    exitCode: execution.exitCode,
    durationMs: execution.durationMs,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    createdAt: execution.createdAt,
  };
}

export interface AutomationLogDto {
  id: number;
  executionId: number;
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

export function toAutomationLogDto(log: AutomationLog): AutomationLogDto {
  return { id: log.id, executionId: log.executionId, timestamp: log.timestamp, level: log.level, message: log.message, source: log.source };
}

// Phase 18 Auftragspunkt 3 "Serverseitige Validierung" - kein createdBy
// (interne Benutzer-id), gleiches Prinzip wie AlertDto/AutomationActionDto
// oben.
export interface AutomationRuleDto {
  id: number;
  projectId: string;
  teamId: string | null;
  name: string;
  checkType: string | null;
  minSeverity: string;
  trigger: string;
  priority: number;
  conditions: AutomationRule["conditions"];
  action: string;
  autoExecute: boolean;
  approvalRequired: boolean;
  cooldownMinutes: number;
  maxExecutionsPerHour: number;
  enabled: boolean;
  riskLevel: AutomationRule["riskLevel"];
  timeoutSeconds: number;
  maxAttemptsPerIncident: number;
  createdAt: string;
  updatedAt: string;
}

export function toAutomationRuleDto(rule: AutomationRule): AutomationRuleDto {
  return {
    id: rule.id,
    projectId: rule.projectId,
    teamId: rule.teamId,
    name: rule.name,
    checkType: rule.checkType,
    minSeverity: rule.minSeverity,
    trigger: rule.trigger,
    priority: rule.priority,
    conditions: rule.conditions,
    action: rule.action,
    autoExecute: rule.autoExecute,
    approvalRequired: rule.approvalRequired,
    cooldownMinutes: rule.cooldownMinutes,
    maxExecutionsPerHour: rule.maxExecutionsPerHour,
    enabled: rule.enabled,
    // Phase 30 - lesend verfuegbar (kein Sicherheitsrisiko, beschreiben nur
    // das Verhalten der Regel), aber bewusst NICHT in create/update-Schemas
    // dieser v1-Route uebernommen: externe API-Konsumenten legen Regeln
    // weiterhin mit sicheren Defaults an (MEDIUM/60s/3), das Feintuning
    // dieser neuen Sicherheitsparameter bleibt vorerst der internen,
    // menschlich beaufsichtigten UI vorbehalten (kein unnoetig breiter
    // externer Schreibzugriff auf sicherheitsrelevante Parameter).
    riskLevel: rule.riskLevel,
    timeoutSeconds: rule.timeoutSeconds,
    maxAttemptsPerIncident: rule.maxAttemptsPerIncident,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

// Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health" -
// kein createdBy (interne Benutzer-id), gleiches Prinzip wie AutomationRuleDto
// oben. "current" ist optional befuellt (GET-Liste/Detail koennen den
// aktuellen Auswertungs-Snapshot mitliefern, ohne dass jeder Aufrufer
// zusaetzlich GET .../status aufrufen muss).
export interface SloDto {
  id: number;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  checkId: string | null;
  name: string;
  description: string | null;
  sliType: string;
  target: number;
  latencyThresholdMs: number | null;
  windowDays: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toSloDto(slo: import("../../types/slo.types").Slo): SloDto {
  return {
    id: slo.id,
    organizationId: slo.organizationId,
    teamId: slo.teamId,
    projectId: slo.projectId,
    checkId: slo.checkId,
    name: slo.name,
    description: slo.description,
    sliType: slo.sliType,
    target: slo.target,
    latencyThresholdMs: slo.latencyThresholdMs,
    windowDays: slo.windowDays,
    enabled: slo.enabled,
    createdAt: slo.createdAt,
    updatedAt: slo.updatedAt,
  };
}

// Phase 20 Auftragspunkt 13 "Externe API" (Credential Management) - kein
// createdBy/revokedBy (interne Benutzer-ids, gleiches Prinzip wie bei allen
// anderen externen DTOs oben) - stattdessen der abgeleitete `status`
// (ACTIVE/EXPIRED/REVOKED, siehe deriveApiKeyStatus() in types/
// api-key.types.ts), der fuer einen externen Konsumenten der eigentlich
// relevante Wert ist. Niemals key_hash - ApiKey (types/api-key.types.ts)
// enthaelt dieses Feld ohnehin nicht.
export interface ApiKeyDto {
  id: string;
  organizationId: string;
  teamId: string | null;
  description: string;
  keyPrefix: string;
  scopes: string[];
  status: ApiKeyStatus;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
  revokedAt: string | null;
}

export function toApiKeyDto(key: ApiKey): ApiKeyDto {
  return {
    id: key.id,
    organizationId: key.organizationId,
    teamId: key.teamId,
    description: key.description,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    status: deriveApiKeyStatus(key),
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    usageCount: key.usageCount,
    createdAt: key.createdAt,
    revokedAt: key.revokedAt,
  };
}

// Auftragspunkt 12 "Pagination" - page/pageSize statt unkontrollierter
// SELECT *-Massenabfragen auf jedem Listen-Endpunkt.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePagination(req: Request): PaginationParams {
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number };
}

export function paginatedResponse<T>(data: T[], params: PaginationParams, total: number): PaginatedResponse<T> {
  return { data, pagination: { page: params.page, pageSize: params.pageSize, total } };
}

// Phase 31 "Enterprise Change/Incident Communication & Stakeholder
// Notification Intelligence" Auftragspunkt 16 "Externe API" - explizite
// Whitelist (kein Spread von IncidentCommunication) wie jeder andere DTO
// hier, damit ein spaeter intern hinzugefuegtes Feld nicht automatisch
// extern sichtbar wird.
export interface IncidentCommunicationDto {
  id: number;
  incidentId: number;
  message: string;
  severity: string;
  targetType: string;
  targetUserId: string | null;
  targetScheduleId: number | null;
  notificationChannelId: string | null;
  createdAt: string;
}

export function toIncidentCommunicationDto(communication: IncidentCommunication): IncidentCommunicationDto {
  return {
    id: communication.id,
    incidentId: communication.incidentId,
    message: communication.message,
    severity: communication.severity,
    targetType: communication.targetType,
    targetUserId: communication.targetUserId,
    targetScheduleId: communication.targetScheduleId,
    notificationChannelId: communication.notificationChannelId,
    createdAt: communication.createdAt,
  };
}

// Phase 39 "Enterprise Resilience External API & Webhook Integration" -
// dieselbe explizite Whitelist wie jeder andere DTO oben. Anders als bei
// Incident/AutomationAction gibt es hier fachlich KEIN internes Feld zu
// verbergen (core/service-resilience.ts liefert bereits eine reine,
// abgeleitete Aggregation ohne Benutzer-ids) - die DTO existiert trotzdem,
// damit ein spaeterer interner Feld-Zusatz nicht automatisch den externen
// Vertrag veraendert (derselbe Grundsatz wie am Dateikopf dokumentiert).
export interface ResilienceOverviewRowDto {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  serviceCriticality: string | null;
  healthScore: number;
  healthStatus: string;
  incidentCount: number;
  highCriticalCount: number;
  openIncidentCount: number;
  mttrMs: number | null;
  recurringIncidentCount: number;
  openProblems: number;
  openCriticalProblems: number;
  sloCount: number;
  criticalSLOCount: number;
  worstSloStatus: string | null;
  errorBudgetRisk: boolean;
  dependencyCount: number;
  dependentCount: number;
  blastRadius: number;
  isPotentialSpof: boolean;
  resilienceStatus: string;
}

export function toResilienceOverviewRowDto(row: import("../../types/resilience.types").ResilienceOverviewRow): ResilienceOverviewRowDto {
  return { ...row };
}

export interface ResilienceSignalDto {
  type: string;
  severity: string;
  title: string;
  explanation: string;
  affectedEntity: { kind: string; id: string | number; name: string };
}

function toResilienceSignalDto(signal: import("../../types/resilience.types").ResilienceSignal): ResilienceSignalDto {
  return { type: signal.type, severity: signal.severity, title: signal.title, explanation: signal.explanation, affectedEntity: { ...signal.affectedEntity } };
}

export interface ServiceResilienceDetailDto {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  serviceCriticality: string | null;
  resilienceStatus: string;
  health: { status: string; reasons: string[]; openIncidents: number };
  reliability: { incidentCount: number; highCriticalCount: number; mttrMs: number | null; recurringIncidentCount: number };
  slo: { sloCount: number; worstSloStatus: string | null; avgErrorBudgetRemainingPercent: number | null };
  problems: { openCount: number; openCriticalCount: number; items: { id: number; title: string; status: string; priority: string }[] };
  dependencies: import("../../types/resilience.types").ServiceDependencyIntelligence | null;
  blastRadius: { affectedServiceCount: number; maxDepthReached: number; truncated: boolean; hasCriticalPath: boolean; spofCount: number } | null;
  isPotentialSpof: boolean;
  activeChangeRisks: import("../../types/resilience.types").ServiceChangeRiskSummary[];
  remediationEffectiveness: { problemId: number; changeId: number; changeTitle: string; status: string }[];
  // Phase 42 "Enterprise Resilience Forecast Intelligence".
  forecast: import("../../types/resilience.types").ServiceResilienceForecast;
  signals: ResilienceSignalDto[];
  // Phase 47 "Enterprise Business Impact & Service Criticality Intelligence".
  businessImpact: ServiceBusinessImpactDto;
}

// Auftragspunkt "explizite Whitelist statt Spread" - {...detail} wuerde JEDES
// Feld von ServiceResilienceDetail (auch neu hinzugekommene wie businessImpact
// mit ownBusinessOwner/factors[].businessOwner, Phase 47) unveraendert in die
// v1-Antwort durchreichen, OHNE dass das ServiceResilienceDetailDto-Interface
// das verhindern wuerde (ein Objekt-Spread wird nicht gegen das Interface
// geprueft). Deshalb ab hier jedes Feld einzeln aufgefuehrt statt gespreadet -
// verhindert genau diese Klasse von versehentlichem Daten-Leck bei
// zukuenftigen Erweiterungen von ServiceResilienceDetail.
export function toServiceResilienceDetailDto(detail: import("../../types/resilience.types").ServiceResilienceDetail): ServiceResilienceDetailDto {
  return {
    projectId: detail.projectId,
    projectName: detail.projectName,
    serviceId: detail.serviceId,
    serviceName: detail.serviceName,
    serviceCriticality: detail.serviceCriticality,
    resilienceStatus: detail.resilienceStatus,
    health: detail.health,
    reliability: detail.reliability,
    slo: detail.slo,
    problems: detail.problems,
    dependencies: detail.dependencies,
    blastRadius: detail.blastRadius,
    isPotentialSpof: detail.isPotentialSpof,
    activeChangeRisks: detail.activeChangeRisks,
    remediationEffectiveness: detail.remediationEffectiveness,
    forecast: detail.forecast,
    signals: detail.signals.map(toResilienceSignalDto),
    businessImpact: toServiceBusinessImpactDto(detail.businessImpact),
  };
}

function toServiceBusinessImpactDto(businessImpact: import("../../types/business-impact.types").ServiceBusinessImpact): ServiceBusinessImpactDto {
  return {
    tier: businessImpact.tier,
    dataQuality: businessImpact.dataQuality,
    ownCriticality: businessImpact.ownCriticality,
    affectedDependentCount: businessImpact.affectedDependentCount,
    activelyImpactedDependentCount: businessImpact.activelyImpactedDependentCount,
    factors: businessImpact.factors.map((f) => ({ kind: f.kind, serviceId: f.serviceId, serviceName: f.serviceName, serviceCriticality: f.serviceCriticality, detail: f.detail })),
    relatedOpenIncidentIds: businessImpact.relatedOpenIncidentIds,
  };
}

// Phase 43 "Enterprise Operational Priority Intelligence" - dieselbe
// explizite Whitelist wie jeder andere DTO oben.
// Phase 44 "Enterprise Priority Queue Acknowledgment Governance" - nur
// lesend Teil der v1-DTO (Sichtbarkeit ist unkritisch); die eigentliche
// Bestaetigungs-AKTION bleibt bewusst session-authentifiziert-only (siehe
// routes/resilience.routes.ts, dieselbe Begruendung wie bei
// changes:read/on_call:read: eine zurechenbarkeitsrelevante menschliche
// Entscheidung ist kein API-Key-Anwendungsfall).
export interface PriorityQueueAcknowledgmentDto {
  acknowledgedBy: string;
  acknowledgedAt: string;
  note: string | null;
  snapshotResilienceStatus: string;
  snapshotPriorityScore: number;
  snapshotReason: string | null;
}

export interface PriorityQueueEntryDto {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  resilienceStatus: string;
  priorityScore: number;
  primaryReason: { signalType: string; severity: string; title: string; explanation: string } | null;
  recommendedAction: string;
  confidence: string;
  signalCount: number;
  acknowledgment: PriorityQueueAcknowledgmentDto | null;
}

export interface PriorityQueueDto {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  entries: PriorityQueueEntryDto[];
}

export function toPriorityQueueDto(queue: import("../../types/resilience.types").PriorityQueue): PriorityQueueDto {
  return {
    ...queue,
    entries: queue.entries.map((entry) => ({
      ...entry,
      primaryReason: entry.primaryReason ? { ...entry.primaryReason } : null,
      acknowledgment: entry.acknowledgment ? { ...entry.acknowledgment } : null,
    })),
  };
}

// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence" - reiner Lese-Endpunkt (Auswertung, keine Aktion), daher
// ohne die Einschraenkung von PriorityQueueAcknowledgmentDto oben; nutzt
// denselben bestehenden resilience:read-Scope, kein neuer Scope.
export interface OutcomeIntelligenceProjectSummaryDto {
  projectId: string;
  projectName: string;
  totalAcknowledgments: number;
  resolvedCount: number;
  partiallyResolvedCount: number;
  regressedCount: number;
  unresolvedCount: number;
  insufficientDataCount: number;
  isRecurringPattern: boolean;
}

export interface OutcomeIntelligenceSummaryDto {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  totalAcknowledgments: number;
  evaluatedAcknowledgments: number;
  counts: Record<string, number>;
  resolutionRatePercent: number | null;
  avgTimeToRecoveryMs: number | null;
  recurringProjects: OutcomeIntelligenceProjectSummaryDto[];
  projects: OutcomeIntelligenceProjectSummaryDto[];
}

export function toOutcomeIntelligenceSummaryDto(summary: import("../../types/outcome-intelligence.types").OutcomeIntelligenceSummary): OutcomeIntelligenceSummaryDto {
  return { ...summary };
}

// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
// dieselbe explizite Whitelist wie jeder andere DTO oben, kein neuer Scope
// (resilience:read genuegt, dieselbe Begruendung wie priority-queue/outcomes).
export interface CapacityWatchlistEntryDto {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  resilienceStatus: string;
  capacitySignals: { type: string; severity: string; title: string; explanation: string; affectedEntity: { kind: string; id: string | number; name: string } }[];
  blastRadius: number;
  isPotentialSpof: boolean;
  dependentCount: number;
  // Phase 54 "Enterprise Predictive Operations & Risk Prevention".
  dependencyRiskScore: number;
}

export interface CapacityWatchlistDto {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  candidatesEvaluated: number;
  entries: CapacityWatchlistEntryDto[];
}

export function toCapacityWatchlistDto(watchlist: import("../../types/capacity-intelligence.types").CapacityWatchlist): CapacityWatchlistDto {
  return {
    ...watchlist,
    entries: watchlist.entries.map((entry) => ({ ...entry, capacitySignals: entry.capacitySignals.map((s) => ({ ...s, affectedEntity: { ...s.affectedEntity } })) })),
  };
}

// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
// dieselbe explizite Whitelist wie jeder andere DTO oben. Sicherheitsbewusst
// OHNE businessOwner (Namen von organisatorischen Verantwortlichen) - die
// v1-API (externe, API-Key-authentifizierte Flaeche) exponiert an KEINER
// bestehenden Stelle businessOwner (auch ServiceResilienceDetailDto oben
// nicht), dieselbe etablierte Grenze wird hier bewusst fortgesetzt statt
// erstmals durchbrochen. Die interne, session-authentifizierte Route zeigt
// businessOwner unveraendert (siehe routes/resilience.routes.ts).
export interface BusinessImpactFactorDto {
  kind: string;
  serviceId: number;
  serviceName: string;
  serviceCriticality: string;
  detail: string;
}

export interface ServiceBusinessImpactDto {
  tier: string;
  dataQuality: string;
  ownCriticality: string | null;
  affectedDependentCount: number;
  activelyImpactedDependentCount: number;
  factors: BusinessImpactFactorDto[];
  relatedOpenIncidentIds: number[];
}

export interface BusinessImpactOverviewEntryDto {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  resilienceStatus: string;
  businessImpact: ServiceBusinessImpactDto;
}

export interface BusinessImpactOverviewDto {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  candidatesEvaluated: number;
  entries: BusinessImpactOverviewEntryDto[];
}

export function toBusinessImpactOverviewDto(overview: import("../../types/business-impact.types").BusinessImpactOverview): BusinessImpactOverviewDto {
  return {
    organizationId: overview.organizationId,
    windowHours: overview.windowHours,
    generatedAt: overview.generatedAt,
    candidatesEvaluated: overview.candidatesEvaluated,
    entries: overview.entries.map((entry) => ({
      projectId: entry.projectId,
      projectName: entry.projectName,
      serviceId: entry.serviceId,
      serviceName: entry.serviceName,
      resilienceStatus: entry.resilienceStatus,
      businessImpact: toServiceBusinessImpactDto(entry.businessImpact),
    })),
  };
}

// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence" -
// anders als die businessImpact-DTOs oben (resilience:read-Scope) wird
// businessOwner hier BEWUSST NICHT entfernt: routes/v1/services.routes.ts
// (services:read-Scope) exponiert businessOwner bereits unveraendert ueber
// GET /v1/services und /v1/services/:id (echter Bestandsanalyse-Fund - die
// gegenteilige Aussage im Phase-47-Abschlussbericht bezog sich nur auf den
// resilience:read-Scope, nicht auf services:read). Dieser Endpunkt liegt
// unter demselben services:read-Scope, daher dieselbe, bereits etablierte
// Sichtbarkeitsgrenze - kein neuer, inkonsistenter Sonderfall.
export interface ServicePortfolioReasonDto {
  kind: string;
  detail: string;
}

export interface ServicePortfolioEntryDto {
  serviceId: number;
  serviceName: string;
  projectId: string | null;
  projectName: string | null;
  criticality: string;
  lifecycleStatus: string;
  environment: string;
  businessOwner: string | null;
  resilienceStatus: string | null;
  dependentCount: number;
  isPotentialSpof: boolean;
  businessImpactTier: string;
  hasCapacitySignal: boolean | "NOT_EVALUATED";
  isRecurringOutcomePattern: boolean | "NOT_EVALUATED";
  classification: string;
  reasons: ServicePortfolioReasonDto[];
}

export interface ServicePortfolioSummaryDto {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  totalServices: number;
  counts: Record<string, number>;
  entries: ServicePortfolioEntryDto[];
}

export function toServicePortfolioSummaryDto(summary: import("../../types/service-portfolio.types").ServicePortfolioSummary): ServicePortfolioSummaryDto {
  return {
    organizationId: summary.organizationId,
    windowHours: summary.windowHours,
    generatedAt: summary.generatedAt,
    totalServices: summary.totalServices,
    counts: summary.counts,
    entries: summary.entries.map((entry) => ({
      serviceId: entry.serviceId,
      serviceName: entry.serviceName,
      projectId: entry.projectId,
      projectName: entry.projectName,
      criticality: entry.criticality,
      lifecycleStatus: entry.lifecycleStatus,
      environment: entry.environment,
      businessOwner: entry.businessOwner,
      resilienceStatus: entry.resilienceStatus,
      dependentCount: entry.dependentCount,
      isPotentialSpof: entry.isPotentialSpof,
      businessImpactTier: entry.businessImpactTier,
      hasCapacitySignal: entry.hasCapacitySignal,
      isRecurringOutcomePattern: entry.isRecurringOutcomePattern,
      classification: entry.classification,
      reasons: entry.reasons.map((r) => ({ kind: r.kind, detail: r.detail })),
    })),
  };
}

// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence" -
// dieselbe explizite Whitelist wie jeder andere DTO oben, kein neuer Scope
// (resilience:read genuegt, dieselbe Begruendung wie die Uebersichten oben).
export interface ProactiveRiskDetectionRecordDto {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  criticality: string | null;
  detectedAt: string;
  clearedAt: string | null;
  signalTitles: string[];
  explanation: string;
  outcome: string;
  outcomeReason: string;
}

export interface ForecastAccuracySummaryDto {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  totalDetections: number;
  evaluatedDetections: number;
  confirmedCount: number;
  falsePositiveCount: number;
  pendingCount: number;
  accuracyRatePercent: number | null;
  detections: ProactiveRiskDetectionRecordDto[];
}

export function toForecastAccuracySummaryDto(summary: import("../../types/proactive-risk.types").ForecastAccuracySummary): ForecastAccuracySummaryDto {
  return {
    organizationId: summary.organizationId,
    windowHours: summary.windowHours,
    generatedAt: summary.generatedAt,
    totalDetections: summary.totalDetections,
    evaluatedDetections: summary.evaluatedDetections,
    confirmedCount: summary.confirmedCount,
    falsePositiveCount: summary.falsePositiveCount,
    pendingCount: summary.pendingCount,
    accuracyRatePercent: summary.accuracyRatePercent,
    detections: summary.detections.map((d) => ({
      projectId: d.projectId,
      projectName: d.projectName,
      serviceId: d.serviceId,
      serviceName: d.serviceName,
      criticality: d.criticality,
      detectedAt: d.detectedAt,
      clearedAt: d.clearedAt,
      signalTitles: d.signalTitles,
      explanation: d.explanation,
      outcome: d.outcome,
      outcomeReason: d.outcomeReason,
    })),
  };
}
