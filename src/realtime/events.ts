import type { CheckResult } from "../types/check-result.types";
import type { HealthStatus } from "../types/health.types";
import type { Incident } from "../types/incident.types";
import type { ProjectHealthSummary } from "../db/dashboard.repository";
import type { AiAnalysisRecord } from "../db/ai.repository";
import type { NotificationStatus } from "../notifications/channel.interface";
import type { AlertRule, AlertEvent } from "../types/alert.types";
import type { MaintenanceWindow } from "../types/maintenance.types";
import type { NotificationEvent } from "../notifications/notification-event.types";
import type { AutomationAction, AutomationExecution, AutomationLog, AutomationRule } from "../types/automation.types";
import type { MonitoringAgent } from "../types/monitoring-agent.types";
import type { SystemBackup } from "../types/backup.types";
import type { AuditLogEntry } from "../types/audit.types";
import type { ForecastMetric } from "../types/forecast.types";
import type { ClusterEvent } from "../types/cluster-event.types";
import type { AgentLogEntry } from "../types/agent-log.types";
import type { Organization } from "../types/organization.types";
import type { Team } from "../types/team.types";
import type { ApiKey } from "../types/api-key.types";
import type { ServiceAccount } from "../types/service-account.types";
import type { Slo } from "../types/slo.types";
import type { Service, ServiceDependency } from "../types/service.types";
import type { OnCallSchedule, OnCallOverride } from "../types/on-call.types";
import type { IncidentPostmortem } from "../types/postmortem.types";
import type { Deployment } from "../types/deployment.types";
import type { Change } from "../types/change.types";
import type { IncidentCommunication } from "../types/incident-communication.types";
import type { ResilienceStatus } from "../types/resilience.types";

// Alle Event-Typen entsprechen echten Zustandsaenderungen im Backend - siehe
// die jeweiligen broadcast()-Aufrufe in monitor.ts/notification.service.ts/
// alerts/alert-evaluator.ts/routes. Kein Event wird ohne zugehoerige echte
// Datenbankaenderung erzeugt.
export enum RealtimeEventType {
  CHECK_UPDATED = "CHECK_UPDATED",
  PROJECT_UPDATED = "PROJECT_UPDATED",
  INCIDENT_CREATED = "INCIDENT_CREATED",
  INCIDENT_RESOLVED = "INCIDENT_RESOLVED",
  NOTIFICATION_SENT = "NOTIFICATION_SENT",
  AI_ANALYSIS_CREATED = "AI_ANALYSIS_CREATED",
  HEALTH_CHANGED = "HEALTH_CHANGED",
  TIMELINE_UPDATED = "TIMELINE_UPDATED",
  USER_ONLINE = "USER_ONLINE",
  USER_OFFLINE = "USER_OFFLINE",
  ALERT_CREATED = "ALERT_CREATED",
  ALERT_UPDATED = "ALERT_UPDATED",
  ALERT_TRIGGERED = "ALERT_TRIGGERED",
  ALERT_DEACTIVATED = "ALERT_DEACTIVATED",
  // Phase 9
  ALERT_ESCALATED = "ALERT_ESCALATED",
  ALERT_SUPPRESSED = "ALERT_SUPPRESSED",
  MAINTENANCE_STARTED = "MAINTENANCE_STARTED",
  MAINTENANCE_ENDED = "MAINTENANCE_ENDED",
  INCIDENT_CORRELATED = "INCIDENT_CORRELATED",
  // Phase 10 - Auftragspunkt 3 "Notification Infrastructure": zusaetzlich zu
  // den bestehenden, spezifischen Events (ALERT_TRIGGERED, ...) fuer ein
  // einheitliches Notification Center im Frontend.
  NOTIFICATION_EVENT = "NOTIFICATION_EVENT",
  // Phase 11 "Enterprise Automation & Self-Healing" (Teil 9). AUTOMATION_*
  // deckt den vollen Lebenszyklus jeder Automatisierungs-Ausfuehrung ab
  // (Approvals-/Executions-Tab im Automation Center). SELF_HEALING_* ist
  // eine zusaetzliche, engere Teilmenge - nur wenn eine Regel eine sichere
  // Aktion vollstaendig automatisch (ohne menschliche Freigabe) ausgefuehrt
  // hat, siehe automation/automation-runner.ts. EXECUTION_LOG streamt
  // einzelne Log-Zeilen live waehrend eine Ausfuehrung laeuft.
  AUTOMATION_STARTED = "AUTOMATION_STARTED",
  AUTOMATION_FINISHED = "AUTOMATION_FINISHED",
  AUTOMATION_FAILED = "AUTOMATION_FAILED",
  AUTOMATION_WAITING_APPROVAL = "AUTOMATION_WAITING_APPROVAL",
  AUTOMATION_APPROVED = "AUTOMATION_APPROVED",
  AUTOMATION_REJECTED = "AUTOMATION_REJECTED",
  SELF_HEALING_STARTED = "SELF_HEALING_STARTED",
  SELF_HEALING_FINISHED = "SELF_HEALING_FINISHED",
  SELF_HEALING_FAILED = "SELF_HEALING_FAILED",
  EXECUTION_LOG = "EXECUTION_LOG",
  // Phase 13 "Enterprise Observability, Distributed Monitoring & Production
  // Operations". AGENT_* begleitet monitoring_agents (Heartbeat-Uebergaenge,
  // siehe core/local-agent.ts). BACKUP_*/RESTORE_* begleiten den Backup
  // Center-Lebenszyklus. STATUSPAGE_UPDATED signalisiert, dass sich die
  // oeffentliche Status-Seite geaendert haben koennte (kein eigener neuer
  // Zustand, nur ein Hinweis zum Neuladen). AUDIT_CREATED begleitet jeden
  // audit_log-Eintrag live. FORECAST_UPDATED signalisiert einen neu
  // berechneten statistischen Forecast.
  AGENT_ONLINE = "AGENT_ONLINE",
  AGENT_OFFLINE = "AGENT_OFFLINE",
  AGENT_HEARTBEAT = "AGENT_HEARTBEAT",
  BACKUP_STARTED = "BACKUP_STARTED",
  BACKUP_FINISHED = "BACKUP_FINISHED",
  RESTORE_STARTED = "RESTORE_STARTED",
  RESTORE_FINISHED = "RESTORE_FINISHED",
  STATUSPAGE_UPDATED = "STATUSPAGE_UPDATED",
  AUDIT_CREATED = "AUDIT_CREATED",
  FORECAST_UPDATED = "FORECAST_UPDATED",
  // Phase 14 "Enterprise Multi-Node Cluster, Remote Agents & High
  // Availability". AGENT_REGISTERED/UPDATED/REMOVED/PAUSED/RESUMED begleiten
  // den Lebenszyklus echter Remote-Agenten (routes/cluster.routes.ts,
  // db/monitoring-agents.repository.ts) - unabhaengig von den Phase-13
  // AGENT_ONLINE/OFFLINE/HEARTBEAT-Events, die den Liveness-Zustand
  // begleiten. CHECK_REASSIGNED begleitet jede Aenderung in
  // agent_assignments (core/distributed-scheduler.ts). FAILOVER_*
  // begleitet core/failover.ts. CLUSTER_UPDATED ist ein allgemeiner
  // Hinweis-Event (analog zu STATUSPAGE_UPDATED) fuer Cluster-Health-
  // Aenderungen. ROLLING_UPDATE_* begleitet core/rolling-update.ts.
  AGENT_REGISTERED = "AGENT_REGISTERED",
  AGENT_UPDATED = "AGENT_UPDATED",
  AGENT_REMOVED = "AGENT_REMOVED",
  AGENT_PAUSED = "AGENT_PAUSED",
  AGENT_RESUMED = "AGENT_RESUMED",
  CHECK_REASSIGNED = "CHECK_REASSIGNED",
  FAILOVER_STARTED = "FAILOVER_STARTED",
  FAILOVER_FINISHED = "FAILOVER_FINISHED",
  CLUSTER_UPDATED = "CLUSTER_UPDATED",
  ROLLING_UPDATE_STARTED = "ROLLING_UPDATE_STARTED",
  ROLLING_UPDATE_FINISHED = "ROLLING_UPDATE_FINISHED",
  // Nicht Teil der urspruenglich genannten 11 Phase-14-Events, aber fuer
  // Auftragspunkt 8 "Agent Logs" ("Live Streaming ueber WebSocket")
  // zwingend erforderlich - siehe Abschlussbericht Punkt 5 fuer die
  // explizite Begruendung dieser additiven Ergaenzung.
  AGENT_LOG_CREATED = "AGENT_LOG_CREATED",
  // Phase 15 "Enterprise Platform, Multi-Tenant SaaS & Global Operations".
  ORGANIZATION_CREATED = "ORGANIZATION_CREATED",
  ORGANIZATION_UPDATED = "ORGANIZATION_UPDATED",
  TEAM_CREATED = "TEAM_CREATED",
  TEAM_UPDATED = "TEAM_UPDATED",
  API_KEY_CREATED = "API_KEY_CREATED",
  API_KEY_REVOKED = "API_KEY_REVOKED",
  SERVICE_ACCOUNT_CREATED = "SERVICE_ACCOUNT_CREATED",
  WEBHOOK_DELIVERED = "WEBHOOK_DELIVERED",
  WEBHOOK_FAILED = "WEBHOOK_FAILED",
  TENANT_UPDATED = "TENANT_UPDATED",
  // Phase 16 "Enterprise API Platform, API-Key Authentication, Quotas &
  // Usage Enforcement" - genau ein neues Realtime-Event-Paar (bewusst kein
  // "API_KEY_USED" pro einzelnem Request, siehe Abschlussbericht: das waere
  // bei realem Traffic reiner Broadcast-Spam ohne Mehrwert ueber das
  // ohnehin bestehende 30s-Polling der Usage-Widgets hinaus). Schwellenwert-
  // Ueberschreitungen der Tages-Quota (config/plan-limits.ts) sind dagegen
  // seltene, echt bedeutsame Momente.
  API_QUOTA_WARNING = "API_QUOTA_WARNING",
  API_QUOTA_EXCEEDED = "API_QUOTA_EXCEEDED",
  // Phase 16 (2. Iteration). API_KEY_ROTATED begleitet die neue "Rotate"-
  // Management-Aktion (Auftragspunkt 8). API_KEY_EXPIRED ist ein ECHTES,
  // lazily zum Zeitpunkt der Nutzung erkanntes Ereignis (middleware/api-
  // key-auth.ts erkennt Ablauf beim Authentifizierungsversuch - es gibt
  // keinen Hintergrund-Sweep, der Ablauf "von selbst" entdeckt). API_USAGE_
  // UPDATED wird bewusst gedrosselt gesendet (hoechstens 1x/5s pro
  // Organisation, siehe core/webhook-dispatch.ts-Nachbar core/api-usage-
  // broadcast.ts) statt pro Request, um die im Phase-15-Abschlussbericht
  // begruendete Anti-Spam-Entscheidung nicht rueckgaengig zu machen.
  API_KEY_ROTATED = "API_KEY_ROTATED",
  API_KEY_EXPIRED = "API_KEY_EXPIRED",
  API_USAGE_UPDATED = "API_USAGE_UPDATED",
  // Phase 17 "Enterprise API Write Platform". ALERT_DELETED ist bewusst
  // NICHT "API_"-praefixiert (anders als die zwei folgenden): eine
  // geloeschte Alert-Regel ist fuer das Frontend dieselbe Information,
  // egal ob ueber die Browser-UI oder die externe API geloescht wurde -
  // schliesst eine bisher fehlende Luecke (Phase 9-16: ALERT_CREATED/
  // UPDATED/DEACTIVATED existierten bereits, ALERT_DELETED nicht - siehe
  // Abschlussbericht "gefundener Bug"). API_AUTOMATION_EXECUTION_REQUESTED
  // ist dagegen echt neu UND API-spezifisch: die interne UI kennt diesen
  // Zustand nicht (der "Execute"-Button ist dort einfach deaktiviert,
  // bevor eine Aktion genehmigt ist) - nur ein externer Aufrufer kann
  // ueberhaupt "versuchen, eine noch nicht genehmigte Aktion auszufuehren".
  ALERT_DELETED = "ALERT_DELETED",
  API_AUTOMATION_EXECUTION_REQUESTED = "API_AUTOMATION_EXECUTION_REQUESTED",
  // Phase 18 "Secure Automation Rule API" - bewusst OHNE "API_"-Praefix,
  // gleiches Prinzip wie ALERT_DELETED oben: eine erstellte/geaenderte/
  // geloeschte Automation-Regel ist dieselbe Information fuer das Frontend,
  // egal ob ueber die interne Automation-Center-UI oder die externe API
  // ausgeloest - beide Wege broadcasten dieselben drei Events (siehe
  // routes/automation-rules.routes.ts UND routes/v1/automation-rules.routes.ts).
  // Genuin neu, da automation_rules bisher (Phase 9-17) ueberhaupt keine
  // Realtime-Events broadcastete (gefundener Bug, siehe Abschlussbericht).
  AUTOMATION_RULE_CREATED = "AUTOMATION_RULE_CREATED",
  AUTOMATION_RULE_UPDATED = "AUTOMATION_RULE_UPDATED",
  AUTOMATION_RULE_DELETED = "AUTOMATION_RULE_DELETED",
  // Phase 19 "Enterprise Observability, API Analytics & Operational
  // Intelligence" - anders als API_USAGE_UPDATED (rein informativ, "die
  // Zahlen haben sich geaendert") sind dies echte, seltene, aus
  // Schwellenwert-Ueberschreitungen abgeleitete OPERATIVE Warnungen (siehe
  // core/api-usage-intelligence.ts): API_USAGE_THRESHOLD_WARNING = die
  // Fehlerquote der letzten 15 Minuten ist ungewoehnlich hoch,
  // API_USAGE_SPIKE_DETECTED = das Anfragevolumen der letzten 5 Minuten
  // liegt weit ueber der eigenen juengsten Baseline. Beide feuern genau
  // einmal pro Uebergang "gesund -> auffaellig" (Hysterese, kein
  // Dauerspam bei anhaltend erhoehten Werten) und sind bewusst Teil der
  // Webhook-Taxonomie (types/webhook.types.ts), analog zu API_QUOTA_
  // WARNING/EXCEEDED.
  API_USAGE_THRESHOLD_WARNING = "API_USAGE_THRESHOLD_WARNING",
  API_USAGE_SPIKE_DETECTED = "API_USAGE_SPIKE_DETECTED",
  // Phase 21 "Enterprise Alerting, Incident Response & Notification
  // Orchestration" Auftragspunkt 3/14 "Incident Lifecycle"/"Realtime" -
  // INCIDENT_CREATED/INCIDENT_RESOLVED existierten bereits (Phase 7-8) fuer
  // die automatische Check-basierte Eroeffnung/Schliessung. Der neue,
  // erweiterte Lifecycle (acknowledge/reopen/assign/resolution reason)
  // braucht drei genuin neue Events: INCIDENT_ACKNOWLEDGED (eigenes Event
  // statt INCIDENT_UPDATED wiederzuverwenden, da das Frontend gezielt
  // reagieren soll - z.B. einen Eskalations-Hinweis ausblenden), INCIDENT_
  // REOPENED (Gegenstueck zu RESOLVED) und INCIDENT_UPDATED als generischer
  // Fallback fuer reine Metadaten-Aenderungen (z.B. Assignee/Kommentar) ohne
  // Statuswechsel. AUTOMATION_STARTED/AUTOMATION_FINISHED (Phase 11) werden
  // fuer die Automation-Integration WIEDERVERWENDET (kein neues
  // "AUTOMATION_COMPLETED" - identische Bedeutung, andere Namensgebung nur
  // im Auftragstext).
  INCIDENT_UPDATED = "INCIDENT_UPDATED",
  INCIDENT_ACKNOWLEDGED = "INCIDENT_ACKNOWLEDGED",
  INCIDENT_REOPENED = "INCIDENT_REOPENED",
  // Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service
  // Health" Auftragspunkt 16 - drei genuin neue Events (SLO_BURN_RATE_WARNING
  // ist die DEGRADED-Zwischenstufe, kein Duplikat von SLO_BREACHED).
  SLO_BREACHED = "SLO_BREACHED",
  SLO_RECOVERED = "SLO_RECOVERED",
  SLO_BURN_RATE_WARNING = "SLO_BURN_RATE_WARNING",
  // Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
  // Intelligence" Auftragspunkt 23 - bewusst OHNE TOPOLOGY_HEALTH_CHANGED:
  // Service-Health wird IMMER live abgeleitet (keine zweite Health-Engine,
  // kein gespeicherter/beobachtbarer Zustandsuebergang) - das Frontend
  // invalidiert Service-/Topology-Caches stattdessen bei den bereits
  // bestehenden zugrunde liegenden Signalen (HEALTH_CHANGED, INCIDENT_*,
  // SLO_BREACHED/RECOVERED), siehe hooks/useRealtime.ts. Nur die 5 Events,
  // die einen echten, gespeicherten CRUD-Vorgang abbilden, sind neu.
  SERVICE_CREATED = "SERVICE_CREATED",
  SERVICE_UPDATED = "SERVICE_UPDATED",
  SERVICE_DELETED = "SERVICE_DELETED",
  DEPENDENCY_CREATED = "DEPENDENCY_CREATED",
  DEPENDENCY_DELETED = "DEPENDENCY_DELETED",
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - analog
  // zu den SERVICE_*/DEPENDENCY_*-Events (Phase 23): "wer ist gerade dran"
  // selbst ist reine, zeitbasierte Berechnung (core/on-call.ts) und loest
  // NIE ein Event aus (kein staendiger Hintergrund-Vergleich noetig) - nur
  // die echten, gespeicherten CRUD-Vorgaenge (Schedule/Override anlegen,
  // aendern, loeschen) sind Events.
  ON_CALL_SCHEDULE_CREATED = "ON_CALL_SCHEDULE_CREATED",
  ON_CALL_SCHEDULE_UPDATED = "ON_CALL_SCHEDULE_UPDATED",
  ON_CALL_SCHEDULE_DELETED = "ON_CALL_SCHEDULE_DELETED",
  ON_CALL_OVERRIDE_CREATED = "ON_CALL_OVERRIDE_CREATED",
  ON_CALL_OVERRIDE_DELETED = "ON_CALL_OVERRIDE_DELETED",
  // Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
  // EIN neues, bewusst leichtgewichtiges Event: kein neues "Event-Pipeline"-
  // Konzept, sondern dieselbe broadcast()-Infrastruktur wie jedes andere
  // Event hier. Traegt nur genug, damit ein offenes Dashboard einen
  // "N Services koennten betroffen sein"-Hinweis zeigen kann - die volle
  // Analyse holt sich das Frontend bei Bedarf ueber den bereits bestehenden
  // GET .../impact-Endpunkt (kein duplizierter Payload).
  SERVICE_IMPACT_DETECTED = "SERVICE_IMPACT_DETECTED",
  // Phase 26 "Enterprise Incident Postmortems & Retrospectives" - drei
  // Events statt eines je Feldaenderung (Publish ist ebenfalls nur eine
  // Statusaenderung): dasselbe Konsolidierungsprinzip wie AUTOMATION_STARTED/
  // AUTOMATION_FINISHED (Phase 11) - das Frontend laedt bei jedem der drei
  // Events das betroffene Postmortem/die Action-Item-Liste ohnehin komplett
  // neu, ein granularerer Event-Zoo braeuchte keinen echten Zusatznutzen.
  INCIDENT_POSTMORTEM_CREATED = "INCIDENT_POSTMORTEM_CREATED",
  INCIDENT_POSTMORTEM_UPDATED = "INCIDENT_POSTMORTEM_UPDATED",
  INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED = "INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED",
  // Leichtgewichtiger Hinweis (kein Postmortem-Datensatz noetig, um ihn
  // auszuloesen) - analog zu SERVICE_IMPACT_DETECTED (Phase 25): fire-and-
  // forget beim Resolve eines High/Critical-Incidents ohne bestehendes
  // Postmortem.
  INCIDENT_POSTMORTEM_SUGGESTED = "INCIDENT_POSTMORTEM_SUGGESTED",
  // Phase 27 "Enterprise Deployment Tracking & Change Correlation" - analog
  // zu SERVICE_CREATED/DELETED (Phase 23): kein UPDATED-Event, Deployments
  // sind unveraenderliche Ereignis-Log-Eintraege (kein Bearbeiten nach dem
  // Anlegen vorgesehen).
  DEPLOYMENT_CREATED = "DEPLOYMENT_CREATED",
  DEPLOYMENT_DELETED = "DEPLOYMENT_DELETED",
  // Phase 27 "Enterprise On-Call & Escalation Management" - STARTED (Stufe
  // 1) und LEVEL_CHANGED (Stufe >1) getrennt, wie im Auftrag benannt, aber
  // aus demselben Code-Pfad ausgeloest (core/incident-escalation.ts) - kein
  // separates ONCALL_ACKNOWLEDGED: das bestehende INCIDENT_ACKNOWLEDGED
  // (Phase 21) deckt genau diesen Uebergang bereits ab, ein zweites Event
  // fuer dieselbe Zustandsaenderung waere die im Auftrag selbst gewarnte
  // "doppeltes Event"-Falle.
  ONCALL_ESCALATION_STARTED = "ONCALL_ESCALATION_STARTED",
  ONCALL_ESCALATION_LEVEL_CHANGED = "ONCALL_ESCALATION_LEVEL_CHANGED",
  ONCALL_ESCALATION_RESOLVED = "ONCALL_ESCALATION_RESOLVED",
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - exakt die im Auftrag benannten sieben Events, keine
  // weiteren (z.B. kein CHANGE_DELETED - Loeschen ist nur im DRAFT-Status
  // erlaubt, siehe routes/changes.routes.ts, und damit ein seltener
  // Admin-Vorgang ohne echten Realtime-Bedarf).
  CHANGE_CREATED = "CHANGE_CREATED",
  CHANGE_UPDATED = "CHANGE_UPDATED",
  CHANGE_STARTED = "CHANGE_STARTED",
  CHANGE_COMPLETED = "CHANGE_COMPLETED",
  CHANGE_CANCELLED = "CHANGE_CANCELLED",
  CHANGE_APPROVED = "CHANGE_APPROVED",
  CHANGE_REJECTED = "CHANGE_REJECTED",
  // Phase 28 (Fortsetzung) "Enterprise Change Management & Deployment
  // Intelligence" - "War die Aenderung erfolgreich?": neuer Endzustand,
  // getrennt von CHANGE_CANCELLED (siehe types/change.types.ts).
  CHANGE_FAILED = "CHANGE_FAILED",
  // Phase 31 "Enterprise Change/Incident Communication & Stakeholder
  // Notification Intelligence" Auftragspunkt 8 "Realtime" - genau EIN neues
  // Event (geprueft: keines der bestehenden Events traegt eine Communication
  // als Payload) fuer "eine neue Kommunikation wurde tatsaechlich versendet".
  // Empfehlungen (Recommendations) sind reine GET-Antworten und broadcasten
  // bewusst NICHT - sie sind kein Zustandswechsel, den andere Clients live
  // nachziehen muessten.
  INCIDENT_COMMUNICATION_CREATED = "INCIDENT_COMMUNICATION_CREATED",
  // Phase 32 "Enterprise Incident Command Center & Operational Coordination"
  // Auftragspunkt 8 "Realtime" - EIN Event fuer alle drei Command-Mutationen
  // (Rolle zugewiesen/entfernt, Checklist-Item geaendert). Bewusst nur
  // {incidentId} als Payload (kein voller Zustand) - der Client invalidiert
  // gezielt die Command-Overview-Query und laedt sie neu, statt den vollen,
  // aggregierten Overview-Payload doppelt (einmal per REST, einmal per WS)
  // zu uebertragen.
  INCIDENT_COMMAND_UPDATED = "INCIDENT_COMMAND_UPDATED",
  // Phase 35 "Enterprise Problem Management & Root-Cause Intelligence" -
  // deckt alle mutierenden Problem-Aktionen ab (Create/Update/Delete/
  // Incident-Link/Unlink/Change-Link/Unlink), dasselbe schlanke
  // {problemId,organizationId}-Payload-Prinzip wie INCIDENT_COMMAND_UPDATED
  // oben (kein voller Problem-Zustand doppelt uebertragen) - kein
  // bestehendes Event deckt Problem-CRUD ab, daher hier neu eingefuehrt
  // (siehe Auftrag Abschnitt 22 "Realtime").
  PROBLEM_UPDATED = "PROBLEM_UPDATED",
  // Phase 38 "Enterprise Resilience Alerting & Notification Intelligence" -
  // die einzige Aussage dieses Events IST der Resilience-Status-Uebergang
  // selbst (core/resilience-alerting.ts) - kein bestehendes Event deckt das
  // ab (die vielen bereits bestehenden Events, die ["resilience"]
  // mit-invalidieren, tragen alle ihre EIGENE Nutzlast, z.B. einen Incident
  // oder eine SLO - keins davon TRAEGT den abgeleiteten resilienceStatus
  // selbst). Payload bewusst schlank ({projectId,previousStatus,newStatus,...},
  // kein voller Overview-Payload doppelt uebertragen) - identisches Prinzip
  // zu INCIDENT_COMMAND_UPDATED/PROBLEM_UPDATED oben.
  RESILIENCE_STATUS_CHANGED = "RESILIENCE_STATUS_CHANGED",
}

export interface NotificationSentPayload {
  projectId: string;
  checkId: string;
  incidentId: number | null;
  channel: string;
  status: NotificationStatus;
  error?: string;
}

export interface AiAnalysisCreatedPayload extends AiAnalysisRecord {
  projectId: string;
  checkId: string;
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
  rootIncidentId: number;
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
  backupId: number;
  label: string;
}

export interface RestorePayload {
  backupId: number;
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
  deliveryId: number;
  eventType: string;
  responseStatus: number;
}

export interface WebhookFailedPayload {
  webhookId: string;
  deliveryId: number;
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

// Phase 23 Auftragspunkt 23 "Realtime".
export interface ServiceDeletedPayload {
  id: number;
  organizationId: string;
  name: string;
}

export interface DependencyDeletedPayload {
  id: number;
  organizationId: string;
}

// Phase 24 Auftragspunkt "Realtime".
export interface OnCallScheduleDeletedPayload {
  id: number;
  organizationId: string;
  name: string;
}

export interface OnCallOverrideDeletedPayload {
  id: number;
  scheduleId: number;
  organizationId: string;
}

// Phase 25 Auftragspunkt "Realtime".
export interface ServiceImpactDetectedPayload {
  serviceId: number;
  serviceName: string;
  organizationId: string;
  affectedCount: number;
  trigger: "INCIDENT" | "SLO_BREACH" | "ALERT";
  triggerLabel: string;
}

// Phase 26 "Enterprise Incident Postmortems & Retrospectives" Auftragspunkt
// "Realtime".
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

export interface DeploymentDeletedPayload {
  id: number;
  projectId: string;
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

// Phase 22 Auftragspunkt 16 "Realtime" - traegt die volle SLO plus den
// aktuellen Auswertungs-Snapshot (core/slo-evaluator.ts), damit das Frontend
// SLO-Overview/-Detail direkt aktualisieren kann, ohne fuer jedes Event
// zusaetzlich nachzuladen.
export interface SloEvaluationEventPayload {
  slo: Slo;
  sliValue: number;
  burnRate: number;
  errorBudgetRemainingPercent: number;
}

// Phase 38 "Enterprise Resilience Alerting & Notification Intelligence" -
// siehe core/resilience-alerting.ts. previousStatus ist null beim allerersten
// beobachteten Status eines Projekts (kein Uebergang, nur eine Baseline -
// derselbe "kein Rauschen beim Kaltstart"-Gedanke wie core/slo-evaluator.ts's
// lastStatusBySloId, das ebenfalls in-memory und nicht persistiert ist).
export interface ResilienceStatusChangedPayload {
  projectId: string;
  projectName: string;
  organizationId: string;
  serviceId: number | null;
  serviceName: string | null;
  previousStatus: ResilienceStatus | null;
  newStatus: ResilienceStatus;
}

// Phase 19 Auftragspunkt 5 "Realtime" - gemeinsame Form fuer beide neuen
// Operational-Intelligence-Events; thresholdPercent ist bei einem Spike die
// Auslastung relativ zur eigenen Baseline (z.B. 340 = "3.4x Baseline"),
// bei einer Fehlerquoten-Warnung der tatsaechliche Fehlerquoten-Prozentsatz.
export interface ApiUsageIntelligencePayload {
  organizationId: string;
  thresholdPercent: number;
  recentRequests: number;
  windowMinutes: number;
}

export interface AutomationRuleDeletedPayload {
  id: number;
  projectId: string;
  name: string;
}

// Diskriminierte Union ueber alle moeglichen Wire-Payloads - der Client kann
// anhand von `type` auf den korrekten Payload-Typ verengen.
export type RealtimeEvent =
  | { type: RealtimeEventType.CHECK_UPDATED; timestamp: string; payload: CheckResult }
  | { type: RealtimeEventType.PROJECT_UPDATED; timestamp: string; payload: ProjectHealthSummary }
  | { type: RealtimeEventType.INCIDENT_CREATED; timestamp: string; payload: Incident }
  | { type: RealtimeEventType.INCIDENT_RESOLVED; timestamp: string; payload: Incident }
  | { type: RealtimeEventType.NOTIFICATION_SENT; timestamp: string; payload: NotificationSentPayload }
  | { type: RealtimeEventType.AI_ANALYSIS_CREATED; timestamp: string; payload: AiAnalysisCreatedPayload }
  | { type: RealtimeEventType.HEALTH_CHANGED; timestamp: string; payload: HealthChangedPayload }
  | { type: RealtimeEventType.TIMELINE_UPDATED; timestamp: string; payload: TimelineUpdatedPayload }
  | { type: RealtimeEventType.USER_ONLINE; timestamp: string; payload: UserPresencePayload }
  | { type: RealtimeEventType.USER_OFFLINE; timestamp: string; payload: UserPresencePayload }
  | { type: RealtimeEventType.ALERT_CREATED; timestamp: string; payload: AlertRule }
  | { type: RealtimeEventType.ALERT_UPDATED; timestamp: string; payload: AlertRule }
  | { type: RealtimeEventType.ALERT_TRIGGERED; timestamp: string; payload: AlertRule }
  | { type: RealtimeEventType.ALERT_DEACTIVATED; timestamp: string; payload: AlertRule }
  | { type: RealtimeEventType.ALERT_ESCALATED; timestamp: string; payload: AlertEscalatedPayload }
  | { type: RealtimeEventType.ALERT_SUPPRESSED; timestamp: string; payload: AlertEvent }
  | { type: RealtimeEventType.MAINTENANCE_STARTED; timestamp: string; payload: MaintenanceWindow }
  | { type: RealtimeEventType.MAINTENANCE_ENDED; timestamp: string; payload: MaintenanceWindow }
  | { type: RealtimeEventType.INCIDENT_CORRELATED; timestamp: string; payload: IncidentCorrelatedPayload }
  | { type: RealtimeEventType.NOTIFICATION_EVENT; timestamp: string; payload: NotificationEvent }
  | { type: RealtimeEventType.AUTOMATION_STARTED; timestamp: string; payload: AutomationExecutionPayload }
  | { type: RealtimeEventType.AUTOMATION_FINISHED; timestamp: string; payload: AutomationExecutionPayload }
  | { type: RealtimeEventType.AUTOMATION_FAILED; timestamp: string; payload: AutomationExecutionPayload }
  | { type: RealtimeEventType.AUTOMATION_WAITING_APPROVAL; timestamp: string; payload: AutomationAction }
  | { type: RealtimeEventType.AUTOMATION_APPROVED; timestamp: string; payload: AutomationApprovalPayload }
  | { type: RealtimeEventType.AUTOMATION_REJECTED; timestamp: string; payload: AutomationApprovalPayload }
  | { type: RealtimeEventType.SELF_HEALING_STARTED; timestamp: string; payload: AutomationExecutionPayload }
  | { type: RealtimeEventType.SELF_HEALING_FINISHED; timestamp: string; payload: AutomationExecutionPayload }
  | { type: RealtimeEventType.SELF_HEALING_FAILED; timestamp: string; payload: AutomationExecutionPayload }
  | { type: RealtimeEventType.EXECUTION_LOG; timestamp: string; payload: AutomationLog }
  | { type: RealtimeEventType.AGENT_ONLINE; timestamp: string; payload: MonitoringAgent }
  | { type: RealtimeEventType.AGENT_OFFLINE; timestamp: string; payload: MonitoringAgent }
  | { type: RealtimeEventType.AGENT_HEARTBEAT; timestamp: string; payload: MonitoringAgent }
  | { type: RealtimeEventType.BACKUP_STARTED; timestamp: string; payload: BackupStartedPayload }
  | { type: RealtimeEventType.BACKUP_FINISHED; timestamp: string; payload: SystemBackup }
  | { type: RealtimeEventType.RESTORE_STARTED; timestamp: string; payload: { backupId: number } }
  | { type: RealtimeEventType.RESTORE_FINISHED; timestamp: string; payload: RestorePayload }
  | { type: RealtimeEventType.STATUSPAGE_UPDATED; timestamp: string; payload: StatusPageUpdatedPayload }
  | { type: RealtimeEventType.AUDIT_CREATED; timestamp: string; payload: AuditLogEntry }
  | { type: RealtimeEventType.FORECAST_UPDATED; timestamp: string; payload: ForecastUpdatedPayload }
  | { type: RealtimeEventType.AGENT_REGISTERED; timestamp: string; payload: MonitoringAgent }
  | { type: RealtimeEventType.AGENT_UPDATED; timestamp: string; payload: MonitoringAgent }
  | { type: RealtimeEventType.AGENT_REMOVED; timestamp: string; payload: AgentRemovedPayload }
  | { type: RealtimeEventType.AGENT_PAUSED; timestamp: string; payload: MonitoringAgent }
  | { type: RealtimeEventType.AGENT_RESUMED; timestamp: string; payload: MonitoringAgent }
  | { type: RealtimeEventType.CHECK_REASSIGNED; timestamp: string; payload: ClusterEvent }
  | { type: RealtimeEventType.FAILOVER_STARTED; timestamp: string; payload: ClusterEvent }
  | { type: RealtimeEventType.FAILOVER_FINISHED; timestamp: string; payload: ClusterEvent }
  | { type: RealtimeEventType.CLUSTER_UPDATED; timestamp: string; payload: ClusterUpdatedPayload }
  | { type: RealtimeEventType.ROLLING_UPDATE_STARTED; timestamp: string; payload: ClusterEvent }
  | { type: RealtimeEventType.ROLLING_UPDATE_FINISHED; timestamp: string; payload: ClusterEvent }
  | { type: RealtimeEventType.AGENT_LOG_CREATED; timestamp: string; payload: AgentLogEntry }
  | { type: RealtimeEventType.ORGANIZATION_CREATED; timestamp: string; payload: Organization }
  | { type: RealtimeEventType.ORGANIZATION_UPDATED; timestamp: string; payload: Organization }
  | { type: RealtimeEventType.TEAM_CREATED; timestamp: string; payload: Team }
  | { type: RealtimeEventType.TEAM_UPDATED; timestamp: string; payload: Team }
  | { type: RealtimeEventType.API_KEY_CREATED; timestamp: string; payload: ApiKey }
  | { type: RealtimeEventType.API_KEY_REVOKED; timestamp: string; payload: ApiKeyRevokedPayload }
  | { type: RealtimeEventType.SERVICE_ACCOUNT_CREATED; timestamp: string; payload: ServiceAccount }
  | { type: RealtimeEventType.WEBHOOK_DELIVERED; timestamp: string; payload: WebhookDeliveredPayload }
  | { type: RealtimeEventType.WEBHOOK_FAILED; timestamp: string; payload: WebhookFailedPayload }
  | { type: RealtimeEventType.TENANT_UPDATED; timestamp: string; payload: TenantUpdatedPayload }
  | { type: RealtimeEventType.API_QUOTA_WARNING; timestamp: string; payload: ApiQuotaEventPayload }
  | { type: RealtimeEventType.API_QUOTA_EXCEEDED; timestamp: string; payload: ApiQuotaEventPayload }
  | { type: RealtimeEventType.API_KEY_ROTATED; timestamp: string; payload: ApiKey }
  | { type: RealtimeEventType.API_KEY_EXPIRED; timestamp: string; payload: ApiKeyLifecycleEventPayload }
  | { type: RealtimeEventType.API_USAGE_UPDATED; timestamp: string; payload: ApiUsageUpdatedPayload }
  | { type: RealtimeEventType.ALERT_DELETED; timestamp: string; payload: AlertDeletedPayload }
  | { type: RealtimeEventType.API_AUTOMATION_EXECUTION_REQUESTED; timestamp: string; payload: AutomationAction }
  | { type: RealtimeEventType.AUTOMATION_RULE_CREATED; timestamp: string; payload: AutomationRule }
  | { type: RealtimeEventType.AUTOMATION_RULE_UPDATED; timestamp: string; payload: AutomationRule }
  | { type: RealtimeEventType.AUTOMATION_RULE_DELETED; timestamp: string; payload: AutomationRuleDeletedPayload }
  | { type: RealtimeEventType.API_USAGE_THRESHOLD_WARNING; timestamp: string; payload: ApiUsageIntelligencePayload }
  | { type: RealtimeEventType.API_USAGE_SPIKE_DETECTED; timestamp: string; payload: ApiUsageIntelligencePayload }
  | { type: RealtimeEventType.INCIDENT_UPDATED; timestamp: string; payload: Incident }
  | { type: RealtimeEventType.INCIDENT_ACKNOWLEDGED; timestamp: string; payload: Incident }
  | { type: RealtimeEventType.INCIDENT_REOPENED; timestamp: string; payload: Incident }
  | { type: RealtimeEventType.SLO_BREACHED; timestamp: string; payload: SloEvaluationEventPayload }
  | { type: RealtimeEventType.SLO_RECOVERED; timestamp: string; payload: SloEvaluationEventPayload }
  | { type: RealtimeEventType.SLO_BURN_RATE_WARNING; timestamp: string; payload: SloEvaluationEventPayload }
  | { type: RealtimeEventType.SERVICE_CREATED; timestamp: string; payload: Service }
  | { type: RealtimeEventType.SERVICE_UPDATED; timestamp: string; payload: Service }
  | { type: RealtimeEventType.SERVICE_DELETED; timestamp: string; payload: ServiceDeletedPayload }
  | { type: RealtimeEventType.DEPENDENCY_CREATED; timestamp: string; payload: ServiceDependency }
  | { type: RealtimeEventType.DEPENDENCY_DELETED; timestamp: string; payload: DependencyDeletedPayload }
  | { type: RealtimeEventType.ON_CALL_SCHEDULE_CREATED; timestamp: string; payload: OnCallSchedule }
  | { type: RealtimeEventType.ON_CALL_SCHEDULE_UPDATED; timestamp: string; payload: OnCallSchedule }
  | { type: RealtimeEventType.ON_CALL_SCHEDULE_DELETED; timestamp: string; payload: OnCallScheduleDeletedPayload }
  | { type: RealtimeEventType.ON_CALL_OVERRIDE_CREATED; timestamp: string; payload: OnCallOverride }
  | { type: RealtimeEventType.ON_CALL_OVERRIDE_DELETED; timestamp: string; payload: OnCallOverrideDeletedPayload }
  | { type: RealtimeEventType.SERVICE_IMPACT_DETECTED; timestamp: string; payload: ServiceImpactDetectedPayload }
  | { type: RealtimeEventType.INCIDENT_POSTMORTEM_CREATED; timestamp: string; payload: IncidentPostmortem }
  | { type: RealtimeEventType.INCIDENT_POSTMORTEM_UPDATED; timestamp: string; payload: IncidentPostmortem }
  | { type: RealtimeEventType.INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED; timestamp: string; payload: PostmortemActionItemUpdatedPayload }
  | { type: RealtimeEventType.INCIDENT_POSTMORTEM_SUGGESTED; timestamp: string; payload: PostmortemSuggestedPayload }
  | { type: RealtimeEventType.DEPLOYMENT_CREATED; timestamp: string; payload: Deployment }
  | { type: RealtimeEventType.DEPLOYMENT_DELETED; timestamp: string; payload: DeploymentDeletedPayload }
  | { type: RealtimeEventType.ONCALL_ESCALATION_STARTED; timestamp: string; payload: IncidentEscalationEventPayload }
  | { type: RealtimeEventType.ONCALL_ESCALATION_LEVEL_CHANGED; timestamp: string; payload: IncidentEscalationEventPayload }
  | { type: RealtimeEventType.ONCALL_ESCALATION_RESOLVED; timestamp: string; payload: IncidentEscalationResolvedPayload }
  | { type: RealtimeEventType.CHANGE_CREATED; timestamp: string; payload: Change }
  | { type: RealtimeEventType.CHANGE_UPDATED; timestamp: string; payload: Change }
  | { type: RealtimeEventType.CHANGE_STARTED; timestamp: string; payload: Change }
  | { type: RealtimeEventType.CHANGE_COMPLETED; timestamp: string; payload: Change }
  | { type: RealtimeEventType.CHANGE_CANCELLED; timestamp: string; payload: Change }
  | { type: RealtimeEventType.CHANGE_APPROVED; timestamp: string; payload: Change }
  | { type: RealtimeEventType.CHANGE_REJECTED; timestamp: string; payload: Change }
  | { type: RealtimeEventType.CHANGE_FAILED; timestamp: string; payload: Change }
  | { type: RealtimeEventType.INCIDENT_COMMUNICATION_CREATED; timestamp: string; payload: IncidentCommunication }
  | { type: RealtimeEventType.INCIDENT_COMMAND_UPDATED; timestamp: string; payload: { incidentId: number } }
  | { type: RealtimeEventType.PROBLEM_UPDATED; timestamp: string; payload: { problemId: number; organizationId: string } }
  | { type: RealtimeEventType.RESILIENCE_STATUS_CHANGED; timestamp: string; payload: ResilienceStatusChangedPayload };

// Ueberladungen statt eines generischen Parameters, damit `type` und
// `payload` beim Aufruf gegeneinander typgeprueft werden (z.B. verhindert
// dies, ein CheckResult mit RealtimeEventType.INCIDENT_CREATED zu senden).
export function createEvent(type: RealtimeEventType.CHECK_UPDATED, payload: CheckResult): RealtimeEvent;
export function createEvent(type: RealtimeEventType.PROJECT_UPDATED, payload: ProjectHealthSummary): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_CREATED, payload: Incident): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_RESOLVED, payload: Incident): RealtimeEvent;
export function createEvent(
  type: RealtimeEventType.NOTIFICATION_SENT,
  payload: NotificationSentPayload,
): RealtimeEvent;
export function createEvent(
  type: RealtimeEventType.AI_ANALYSIS_CREATED,
  payload: AiAnalysisCreatedPayload,
): RealtimeEvent;
export function createEvent(type: RealtimeEventType.HEALTH_CHANGED, payload: HealthChangedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.TIMELINE_UPDATED, payload: TimelineUpdatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.USER_ONLINE, payload: UserPresencePayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.USER_OFFLINE, payload: UserPresencePayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ALERT_CREATED, payload: AlertRule): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ALERT_UPDATED, payload: AlertRule): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ALERT_TRIGGERED, payload: AlertRule): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ALERT_DEACTIVATED, payload: AlertRule): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ALERT_ESCALATED, payload: AlertEscalatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ALERT_SUPPRESSED, payload: AlertEvent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.MAINTENANCE_STARTED, payload: MaintenanceWindow): RealtimeEvent;
export function createEvent(type: RealtimeEventType.MAINTENANCE_ENDED, payload: MaintenanceWindow): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_CORRELATED, payload: IncidentCorrelatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.NOTIFICATION_EVENT, payload: NotificationEvent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_STARTED, payload: AutomationExecutionPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_FINISHED, payload: AutomationExecutionPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_FAILED, payload: AutomationExecutionPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_WAITING_APPROVAL, payload: AutomationAction): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_APPROVED, payload: AutomationApprovalPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_REJECTED, payload: AutomationApprovalPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SELF_HEALING_STARTED, payload: AutomationExecutionPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SELF_HEALING_FINISHED, payload: AutomationExecutionPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SELF_HEALING_FAILED, payload: AutomationExecutionPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.EXECUTION_LOG, payload: AutomationLog): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_ONLINE, payload: MonitoringAgent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_OFFLINE, payload: MonitoringAgent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_HEARTBEAT, payload: MonitoringAgent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.BACKUP_STARTED, payload: BackupStartedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.BACKUP_FINISHED, payload: SystemBackup): RealtimeEvent;
export function createEvent(type: RealtimeEventType.RESTORE_STARTED, payload: { backupId: number }): RealtimeEvent;
export function createEvent(type: RealtimeEventType.RESTORE_FINISHED, payload: RestorePayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.STATUSPAGE_UPDATED, payload: StatusPageUpdatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUDIT_CREATED, payload: AuditLogEntry): RealtimeEvent;
export function createEvent(type: RealtimeEventType.FORECAST_UPDATED, payload: ForecastUpdatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_REGISTERED, payload: MonitoringAgent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_UPDATED, payload: MonitoringAgent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_REMOVED, payload: AgentRemovedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_PAUSED, payload: MonitoringAgent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_RESUMED, payload: MonitoringAgent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHECK_REASSIGNED, payload: ClusterEvent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.FAILOVER_STARTED, payload: ClusterEvent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.FAILOVER_FINISHED, payload: ClusterEvent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CLUSTER_UPDATED, payload: ClusterUpdatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ROLLING_UPDATE_STARTED, payload: ClusterEvent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ROLLING_UPDATE_FINISHED, payload: ClusterEvent): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AGENT_LOG_CREATED, payload: AgentLogEntry): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ORGANIZATION_CREATED, payload: Organization): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ORGANIZATION_UPDATED, payload: Organization): RealtimeEvent;
export function createEvent(type: RealtimeEventType.TEAM_CREATED, payload: Team): RealtimeEvent;
export function createEvent(type: RealtimeEventType.TEAM_UPDATED, payload: Team): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_KEY_CREATED, payload: ApiKey): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_KEY_REVOKED, payload: ApiKeyRevokedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SERVICE_ACCOUNT_CREATED, payload: ServiceAccount): RealtimeEvent;
export function createEvent(type: RealtimeEventType.WEBHOOK_DELIVERED, payload: WebhookDeliveredPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.WEBHOOK_FAILED, payload: WebhookFailedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.TENANT_UPDATED, payload: TenantUpdatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_QUOTA_WARNING, payload: ApiQuotaEventPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_QUOTA_EXCEEDED, payload: ApiQuotaEventPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_KEY_ROTATED, payload: ApiKey): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_KEY_EXPIRED, payload: ApiKeyLifecycleEventPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_USAGE_UPDATED, payload: ApiUsageUpdatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ALERT_DELETED, payload: AlertDeletedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_AUTOMATION_EXECUTION_REQUESTED, payload: AutomationAction): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_RULE_CREATED, payload: AutomationRule): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_RULE_UPDATED, payload: AutomationRule): RealtimeEvent;
export function createEvent(type: RealtimeEventType.AUTOMATION_RULE_DELETED, payload: AutomationRuleDeletedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_USAGE_THRESHOLD_WARNING, payload: ApiUsageIntelligencePayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.API_USAGE_SPIKE_DETECTED, payload: ApiUsageIntelligencePayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_UPDATED, payload: Incident): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_ACKNOWLEDGED, payload: Incident): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_REOPENED, payload: Incident): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SLO_BREACHED, payload: SloEvaluationEventPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SLO_RECOVERED, payload: SloEvaluationEventPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SLO_BURN_RATE_WARNING, payload: SloEvaluationEventPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SERVICE_CREATED, payload: Service): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SERVICE_UPDATED, payload: Service): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SERVICE_DELETED, payload: ServiceDeletedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.DEPENDENCY_CREATED, payload: ServiceDependency): RealtimeEvent;
export function createEvent(type: RealtimeEventType.DEPENDENCY_DELETED, payload: DependencyDeletedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ON_CALL_SCHEDULE_CREATED, payload: OnCallSchedule): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ON_CALL_SCHEDULE_UPDATED, payload: OnCallSchedule): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ON_CALL_SCHEDULE_DELETED, payload: OnCallScheduleDeletedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ON_CALL_OVERRIDE_CREATED, payload: OnCallOverride): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ON_CALL_OVERRIDE_DELETED, payload: OnCallOverrideDeletedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.SERVICE_IMPACT_DETECTED, payload: ServiceImpactDetectedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_POSTMORTEM_CREATED, payload: IncidentPostmortem): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_POSTMORTEM_UPDATED, payload: IncidentPostmortem): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED, payload: PostmortemActionItemUpdatedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_POSTMORTEM_SUGGESTED, payload: PostmortemSuggestedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.DEPLOYMENT_CREATED, payload: Deployment): RealtimeEvent;
export function createEvent(type: RealtimeEventType.DEPLOYMENT_DELETED, payload: DeploymentDeletedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ONCALL_ESCALATION_STARTED, payload: IncidentEscalationEventPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ONCALL_ESCALATION_LEVEL_CHANGED, payload: IncidentEscalationEventPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.ONCALL_ESCALATION_RESOLVED, payload: IncidentEscalationResolvedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHANGE_CREATED, payload: Change): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHANGE_UPDATED, payload: Change): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHANGE_STARTED, payload: Change): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHANGE_COMPLETED, payload: Change): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHANGE_CANCELLED, payload: Change): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHANGE_APPROVED, payload: Change): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHANGE_REJECTED, payload: Change): RealtimeEvent;
export function createEvent(type: RealtimeEventType.CHANGE_FAILED, payload: Change): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_COMMUNICATION_CREATED, payload: IncidentCommunication): RealtimeEvent;
export function createEvent(type: RealtimeEventType.INCIDENT_COMMAND_UPDATED, payload: { incidentId: number }): RealtimeEvent;
export function createEvent(type: RealtimeEventType.PROBLEM_UPDATED, payload: { problemId: number; organizationId: string }): RealtimeEvent;
export function createEvent(type: RealtimeEventType.RESILIENCE_STATUS_CHANGED, payload: ResilienceStatusChangedPayload): RealtimeEvent;
export function createEvent(type: RealtimeEventType, payload: RealtimeEvent["payload"]): RealtimeEvent {
  return { type, timestamp: new Date().toISOString(), payload } as RealtimeEvent;
}
