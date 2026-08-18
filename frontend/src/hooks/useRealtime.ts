import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getRealtimeStatus, subscribeRealtimeEvents, subscribeRealtimeStatus } from "../realtime/realtimeClient";
import { queryKeys } from "./queryKeys";
import type { RealtimeConnectionStatus, RealtimeEvent } from "../types/realtime.types";
import type { ProjectHealthSummary } from "../types/dashboard.types";

export interface RealtimeNotification {
  id: string;
  severity: "success" | "info" | "warning" | "error";
  message: string;
}

// Phase 38 - dieselbe Rangordnung wie core/service-resilience.ts#RESILIENCE_RANK
// (Backend), hier nur fuer die Degrading/Recovering-Unterscheidung im Toast.
const RESILIENCE_RANK: Record<"HEALTHY" | "DEGRADED" | "AT_RISK" | "CRITICAL" | "UNKNOWN", number> = {
  UNKNOWN: 0,
  HEALTHY: 1,
  DEGRADED: 2,
  AT_RISK: 3,
  CRITICAL: 4,
};

export interface UseRealtimeResult {
  status: RealtimeConnectionStatus;
  notifications: RealtimeNotification[];
  dismissNotification: (id: string) => void;
}

// Reagiert auf echte Backend-Events und aktualisiert ausschliesslich die
// davon betroffenen React-Query-Caches (gezielte invalidateQueries/
// setQueryData statt eines kompletten Reloads oder Refetch-aller-Queries).
// Wird einmal zentral in PageContainer aufgerufen (siehe dort) - so bekommen
// alle Seiten inkl. Mini City dieselbe Realtime-Synchronisation, ohne dass
// jede Seite den Hook selbst einbinden muss.
export function useRealtime(): UseRealtimeResult {
  const queryClient = useQueryClient();
  const status = useSyncExternalStore(
    (onChange) => subscribeRealtimeStatus(() => onChange()),
    getRealtimeStatus,
    getRealtimeStatus,
  );
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const notificationSeq = useRef(0);
  const previousStatusRef = useRef<RealtimeConnectionStatus>(status);
  const analyticsInvalidateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Waehrend eines Verbindungsabbruchs koennen Events verpasst worden sein
  // (der Server sendet nicht nachtraeglich, was waehrend der Ausfallzeit
  // passiert ist). Bei Rueckkehr zu "connected" nach "reconnecting"/"offline"
  // daher die zentralen Caches einmalig neu laden, statt auf den naechsten
  // regulaeren Refetch-Intervall (bis zu 60s) zu warten.
  useEffect(() => {
    const wasDisconnected = previousStatusRef.current === "reconnecting" || previousStatusRef.current === "offline";
    if (status === "connected" && wasDisconnected) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectsHealth });
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "events"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "timeline"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
    previousStatusRef.current = status;
  }, [status, queryClient]);

  useEffect(() => {
    const pushNotification = (notification: Omit<RealtimeNotification, "id">): void => {
      notificationSeq.current += 1;
      const id = `rt-${notificationSeq.current}`;
      setNotifications((current) => [...current, { ...notification, id }]);
    };

    // CHECK_UPDATED/PROJECT_UPDATED/HEALTH_CHANGED koennen sehr haeufig
    // feuern (ein Event pro Check-Lauf). Analytics-Queries fassen viele
    // Aggregat-Abfragen zusammen - ein Refetch pro Einzelevent waere teuer
    // und unnoetig, da sich Verlaufs-/Summary-Werte auf Minutenbasis kaum
    // sichtbar aendern. ANALYTICS_DEBOUNCE_MS buendelt daher mehrere Events
    // zu einer einzigen Invalidierung (immer noch rein event-getrieben, kein
    // Polling). Fuer seltenere, wichtigere Ereignisse (neuer/geloester
    // Incident) wird sofort invalidiert.
    const ANALYTICS_DEBOUNCE_MS = 4_000;
    const scheduleAnalyticsInvalidation = (): void => {
      if (analyticsInvalidateTimer.current !== undefined) return;
      analyticsInvalidateTimer.current = setTimeout(() => {
        analyticsInvalidateTimer.current = undefined;
        void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      }, ANALYTICS_DEBOUNCE_MS);
    };

    // Phase 29 "Enterprise Change Intelligence, Risk Correlation &
    // Deployment Safety" Auftragspunkt 8 "Realtime" - bewusst KEIN neues
    // Event: die Risikoanalyse wird ausschliesslich aus bereits
    // bestehenden Signalen berechnet (Incidents/SLOs/Alerts/Changes/
    // Deployments/Wartungsfenster), jedes davon hat bereits ein eigenes
    // Realtime-Event. Ein offener Change-Detail-Screen hat maximal EINE
    // aktive Risk-Query gleichzeitig - Praedikat-basierte Invalidierung
    // (kein bekannter changeId in den meisten dieser Events) reicht.
    const invalidateOpenChangeRiskQueries = (): void => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey.length >= 2 && q.queryKey[0] === "changes" && q.queryKey[q.queryKey.length - 1] === "risk" });
    };

    // Phase 30 "Enterprise Reliability, Automated Recovery & Operational
    // Resilience" Auftragspunkt 11 "Realtime" - dasselbe Praedikat-Muster
    // wie invalidateOpenChangeRiskQueries() (Phase 29): die Safety-Gate-
    // Signale (Automation-Executions/Changes/Wartungsfenster/Incidents)
    // haben bereits eigene Events, kein neues Event noetig.
    const invalidateOpenIncidentRecoveryQueries = (): void => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey.length >= 2 && q.queryKey[0] === "incidents" && q.queryKey[q.queryKey.length - 1] === "recovery-actions" });
    };

    // Phase 32 "Enterprise Incident Command Center & Operational
    // Coordination" - der Command Overview aggregiert Escalation/Recovery/
    // Communication/Change-Intelligence/Impact, alle bereits mit eigenen
    // Events. Dasselbe Praedikat-Muster wie oben, damit ein offener Command-
    // Overview-Screen ohne neues Server-Event aktuell bleibt, wenn eines
    // dieser zugrunde liegenden Signale sich aendert.
    const invalidateOpenIncidentCommandOverviewQueries = (): void => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey.length >= 2 && q.queryKey[0] === "incidents" && q.queryKey[q.queryKey.length - 1] === "command-overview" });
    };

    // Phase 33 "Enterprise Reliability Intelligence & Incident Learning"
    // Auftragspunkt 18 "Realtime" - bewusst KEIN neues Event: die
    // Reliability-Aggregationen leiten sich ausschliesslich aus Incidents/
    // Postmortems/Changes/Automation-Ausfuehrungen ab, die bereits eigene
    // Events haben. Einfache Praefix-Invalidierung (kein detailseiten-
    // gebundenes Praedikat noetig, ["reliability", ...] ist immer eine
    // Uebersichtsseite, keine Einzeldatensatz-Query).
    const invalidateReliabilityQueries = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["reliability"] });
    };

    // Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence"
    // Auftragspunkt 23 "Realtime" - die Effectiveness-Analyse ist rein
    // lesend, kein neues Event noetig: bestehende Incident-/Change-/SLO-
    // Events (die die zugrunde liegenden Rohdaten veraendern) invalidieren
    // zusaetzlich den ["problems"]-Praefix, unter dem sowohl Problem-Detail
    // als auch die neue Effectiveness-Query haengen (siehe hooks/queryKeys.ts).
    const invalidateProblemsQueries = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["problems"] });
    };

    // Phase 37 "Enterprise Service Resilience & Dependency Intelligence" -
    // dieselbe Praefix-Invalidierung wie Reliability/Problems oben: die
    // Resilience-Uebersicht/-Details leiten sich ausschliesslich aus bereits
    // bestehenden Signalen ab (Incidents/Changes/SLOs/Probleme/Topologie),
    // kein neues Event noetig.
    const invalidateResilienceQueries = (): void => {
      void queryClient.invalidateQueries({ queryKey: ["resilience"] });
    };

    const handleEvent = (event: RealtimeEvent): void => {
      switch (event.type) {
        case "CHECK_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.projectDetail(event.payload.projectId) });
          scheduleAnalyticsInvalidation();
          break;
        }

        case "PROJECT_UPDATED": {
          queryClient.setQueryData<ProjectHealthSummary[]>(queryKeys.projectsHealth, (current) =>
            current?.map((project) => (project.id === event.payload.id ? event.payload : project)),
          );
          void queryClient.invalidateQueries({ queryKey: queryKeys.projectDetail(event.payload.id) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
          scheduleAnalyticsInvalidation();
          break;
        }

        case "INCIDENT_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["incidents"] });
          void queryClient.invalidateQueries({ queryKey: ["dashboard", "events"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.projectDetail(event.payload.projectId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
          void queryClient.invalidateQueries({ queryKey: ["analytics"] });
          // Phase 23 - Service-Health/Topology sind aus Incidents abgeleitet
          // (core/service-health.ts) - kein eigenes TOPOLOGY_HEALTH_CHANGED-
          // Event (siehe Backend-Kommentar in realtime/events.ts), stattdessen
          // Invalidierung bei den zugrunde liegenden Signalen hier.
          void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
          invalidateOpenChangeRiskQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          invalidateReliabilityQueries();
          invalidateProblemsQueries();
          invalidateResilienceQueries();
          pushNotification({ severity: "error", message: `New incident: ${event.payload.title}` });
          break;
        }

        case "INCIDENT_RESOLVED": {
          void queryClient.invalidateQueries({ queryKey: ["incidents"] });
          void queryClient.invalidateQueries({ queryKey: ["dashboard", "events"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.projectDetail(event.payload.projectId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
          void queryClient.invalidateQueries({ queryKey: ["analytics"] });
          void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
          invalidateOpenChangeRiskQueries();
          invalidateOpenIncidentRecoveryQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          invalidateReliabilityQueries();
          invalidateProblemsQueries();
          invalidateResilienceQueries();
          pushNotification({ severity: "success", message: `Incident resolved: ${event.payload.title}` });
          break;
        }

        case "NOTIFICATION_SENT": {
          // Treibt die City-Notification-Center-Zahlen (summary.notifications)
          // - keine eigene Snackbar, siehe Auftrag. Phase 21: zusaetzlich die
          // Timeline der betroffenen Incident-Detailseite, falls vorhanden
          // (incidentId ist bei projektbezogenen Notification-Events null).
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
          if (event.payload.incidentId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(event.payload.incidentId) });
          }
          break;
        }

        // Phase 21 "Enterprise Alerting, Incident Response & Notification
        // Orchestration" Auftragspunkt 14 "Realtime" - die 3 neuen Events;
        // alle tragen den vollen aktualisierten Incident als Payload
        // (mirrorren INCIDENT_CREATED/INCIDENT_RESOLVED oben).
        case "INCIDENT_UPDATED":
        case "INCIDENT_ACKNOWLEDGED":
        case "INCIDENT_REOPENED": {
          void queryClient.invalidateQueries({ queryKey: ["incidents"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incident(event.payload.id) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(event.payload.id) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
          if (event.type === "INCIDENT_REOPENED") {
            void queryClient.invalidateQueries({ queryKey: queryKeys.incidentRecoveryActions(event.payload.id) });
          }
          invalidateReliabilityQueries();
          invalidateProblemsQueries();
          invalidateResilienceQueries();
          if (event.type === "INCIDENT_ACKNOWLEDGED") {
            pushNotification({ severity: "info", message: `Incident acknowledged: ${event.payload.title}` });
          } else if (event.type === "INCIDENT_REOPENED") {
            pushNotification({ severity: "warning", message: `Incident reopened: ${event.payload.title}` });
          }
          break;
        }

        // Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service
        // Health" Auftragspunkt 16 "Realtime" - invalidiert die SLO-
        // Uebersicht (Praefix ["platform","slo"] deckt Liste + Detail +
        // History ab, siehe hooks/queryKeys.ts) und zeigt einen Hinweis nur
        // fuer tatsaechliche Zustandsuebergaenge (nicht bei jedem
        // 2-Minuten-Tick, da core/slo-evaluator.ts nur bei einer Aenderung
        // sendet).
        case "SLO_BREACHED":
        case "SLO_RECOVERED":
        case "SLO_BURN_RATE_WARNING": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "slo"] });
          void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
          invalidateOpenChangeRiskQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          // Phase 34 - die Reliability-Seite (Phase 33) zeigt seit dieser
          // Phase eine SLO-Zusammenfassung je Projekt (worstSloStatus/
          // avgErrorBudgetRemainingPercent), muss also bei einem SLO-
          // Statuswechsel ebenfalls aktualisiert werden.
          invalidateReliabilityQueries();
          invalidateProblemsQueries();
          invalidateResilienceQueries();
          if (event.type === "SLO_BREACHED") {
            pushNotification({ severity: "error", message: `SLO breached: ${event.payload.slo.name}` });
          } else if (event.type === "SLO_RECOVERED") {
            pushNotification({ severity: "success", message: `SLO recovered: ${event.payload.slo.name}` });
          } else {
            pushNotification({ severity: "warning", message: `SLO burn rate warning: ${event.payload.slo.name} (${event.payload.burnRate}x)` });
          }
          break;
        }

        // Phase 23 "Enterprise Service Catalog, Dependency Mapping &
        // Topology Intelligence" Auftragspunkt 23 "Realtime".
        case "SERVICE_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
          void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
          invalidateResilienceQueries();
          pushNotification({ severity: "info", message: `Service created: ${event.payload.name}` });
          break;
        }

        case "SERVICE_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
          void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
          invalidateResilienceQueries();
          break;
        }

        case "SERVICE_DELETED": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
          void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
          invalidateResilienceQueries();
          pushNotification({ severity: "info", message: `Service deleted: ${event.payload.name}` });
          break;
        }

        case "DEPENDENCY_CREATED":
        case "DEPENDENCY_DELETED": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
          void queryClient.invalidateQueries({ queryKey: ["platform", "topology"] });
          invalidateResilienceQueries();
          break;
        }

        // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" -
        // dasselbe Muster wie SERVICE_*/DEPENDENCY_* oben: "wer ist gerade
        // dran" selbst loest nie ein Event aus (reine Zeitberechnung), nur
        // echte CRUD-Vorgaenge invalidieren den Cache.
        case "ON_CALL_SCHEDULE_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["on-call"] });
          pushNotification({ severity: "info", message: `On-call schedule created: ${event.payload.name}` });
          break;
        }

        case "ON_CALL_SCHEDULE_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["on-call"] });
          break;
        }

        case "ON_CALL_SCHEDULE_DELETED": {
          void queryClient.invalidateQueries({ queryKey: ["on-call"] });
          pushNotification({ severity: "info", message: `On-call schedule deleted: ${event.payload.name}` });
          break;
        }

        case "ON_CALL_OVERRIDE_CREATED":
        case "ON_CALL_OVERRIDE_DELETED": {
          void queryClient.invalidateQueries({ queryKey: ["on-call"] });
          break;
        }

        // Phase 25 "Enterprise Service Dependency Intelligence & Impact
        // Analysis" - leichtgewichtiger Live-Hinweis (siehe core/topology.ts
        // #notifyImpactIfSignificant): kein Cache-Invalidierungs-Ziel noetig
        // (die Impact-Daten selbst aendern sich durch dieses Event nicht,
        // nur eine Toast-Benachrichtigung fuer offene Dashboards).
        case "SERVICE_IMPACT_DETECTED": {
          pushNotification({
            severity: event.payload.trigger === "INCIDENT" ? "warning" : "info",
            message: `${event.payload.triggerLabel} - up to ${event.payload.affectedCount} service(s) downstream of "${event.payload.serviceName}" could be affected.`,
          });
          break;
        }

        // Phase 26 "Enterprise Incident Postmortems & Retrospectives" -
        // konsolidierte Events (ein CREATED/UPDATED pro Postmortem statt pro
        // Feld), invalidiert sowohl die Listen- als auch die
        // Incident-Detail-Query (["postmortems"]-Praefix deckt die
        // Postmortems-Uebersichtsseite ab).
        case "INCIDENT_POSTMORTEM_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["postmortems"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentPostmortem(String(event.payload.incidentId)) });
          invalidateReliabilityQueries();
          break;
        }

        case "INCIDENT_POSTMORTEM_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["postmortems"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentPostmortem(String(event.payload.incidentId)) });
          invalidateReliabilityQueries();
          if (event.payload.status === "PUBLISHED") {
            pushNotification({ severity: "success", message: `Postmortem published for incident #${event.payload.incidentId}` });
          }
          break;
        }

        case "INCIDENT_POSTMORTEM_ACTION_ITEM_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["postmortems"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentPostmortem(String(event.payload.incidentId)) });
          invalidateReliabilityQueries();
          break;
        }

        case "INCIDENT_POSTMORTEM_SUGGESTED": {
          pushNotification({
            severity: "info",
            message: `Consider writing a postmortem for "${event.payload.incidentTitle}" (${event.payload.severity})`,
          });
          break;
        }

        // Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
        // invalidiert die Deployments-Liste des betroffenen Projekts
        // (Praefix deckt jeden Filter/jede Query-Variante ab, siehe
        // hooks/queryKeys.ts) sowie die Incident-Korrelationsabfrage, falls
        // gerade eine Incident-Detailseite offen ist.
        case "DEPLOYMENT_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["projects", event.payload.projectId, "deployments"] });
          void queryClient.invalidateQueries({ queryKey: ["incidents", "detail"], predicate: (q) => q.queryKey.includes("recent-deployments") });
          invalidateOpenChangeRiskQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          pushNotification({ severity: "info", message: `Deployment recorded: ${event.payload.version} (${event.payload.environment})` });
          break;
        }

        case "DEPLOYMENT_DELETED": {
          void queryClient.invalidateQueries({ queryKey: ["projects", event.payload.projectId, "deployments"] });
          break;
        }

        // Phase 27 "Enterprise On-Call & Escalation Management" - invalidiert
        // gezielt den Eskalationsstatus des betroffenen Incidents (Praefix
        // deckt jede Query-Variante ab).
        case "ONCALL_ESCALATION_STARTED": {
          void queryClient.invalidateQueries({ queryKey: ["incidents", "detail", String(event.payload.incidentId), "escalation"] });
          pushNotification({
            severity: "warning",
            message: `Escalation started for incident #${event.payload.incidentId}${event.payload.targetUserName ? ` - on call: ${event.payload.targetUserName}` : ""}`,
          });
          break;
        }

        case "ONCALL_ESCALATION_LEVEL_CHANGED": {
          void queryClient.invalidateQueries({ queryKey: ["incidents", "detail", String(event.payload.incidentId), "escalation"] });
          pushNotification({
            severity: "warning",
            message: `Incident #${event.payload.incidentId} escalated to step ${event.payload.stepOrder}${event.payload.targetUserName ? ` - on call: ${event.payload.targetUserName}` : ""}`,
          });
          break;
        }

        case "ONCALL_ESCALATION_RESOLVED": {
          void queryClient.invalidateQueries({ queryKey: ["incidents", "detail", String(event.payload.incidentId), "escalation"] });
          break;
        }

        case "AI_ANALYSIS_CREATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
          pushNotification({ severity: "info", message: `AI analysis ready for ${event.payload.checkId}` });
          break;
        }

        case "HEALTH_CHANGED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary });
          void queryClient.invalidateQueries({ queryKey: queryKeys.projectsHealth });
          void queryClient.invalidateQueries({ queryKey: ["platform", "services"] });
          scheduleAnalyticsInvalidation();
          break;
        }

        case "TIMELINE_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["dashboard", "timeline"] });
          break;
        }

        case "USER_ONLINE":
        case "USER_OFFLINE": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.users });
          void queryClient.invalidateQueries({ queryKey: queryKeys.user(event.payload.userId) });
          break;
        }

        case "ALERT_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["alerts"] });
          break;
        }

        case "ALERT_UPDATED":
        case "ALERT_DEACTIVATED": {
          void queryClient.invalidateQueries({ queryKey: ["alerts"] });
          break;
        }

        // Phase 17 - schliesst eine bisher fehlende Luecke: geloeschte
        // Alert-Regeln aktualisierten die Liste bisher nicht live (weder
        // ueber die Browser-UI noch die neue externe API).
        case "ALERT_DELETED": {
          void queryClient.invalidateQueries({ queryKey: ["alerts"] });
          break;
        }

        case "ALERT_TRIGGERED": {
          void queryClient.invalidateQueries({ queryKey: ["alerts"] });
          void queryClient.invalidateQueries({ queryKey: ["alert-events"] });
          pushNotification({ severity: "warning", message: `Alert triggered: ${event.payload.name}` });
          break;
        }

        case "ALERT_ESCALATED": {
          void queryClient.invalidateQueries({ queryKey: ["alert-events"] });
          pushNotification({
            severity: "error",
            message: `Alert escalated: ${event.payload.alertEvent.alertRuleName} (step ${event.payload.stepOrder} → ${event.payload.channelId})`,
          });
          break;
        }

        case "ALERT_SUPPRESSED": {
          void queryClient.invalidateQueries({ queryKey: ["alert-events"] });
          void queryClient.invalidateQueries({ queryKey: ["alerts"] });
          break;
        }

        case "MAINTENANCE_STARTED": {
          void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
          invalidateOpenChangeRiskQueries();
          invalidateOpenIncidentRecoveryQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          pushNotification({ severity: "info", message: `Maintenance started: ${event.payload.reason}` });
          break;
        }

        case "MAINTENANCE_ENDED": {
          void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
          void queryClient.invalidateQueries({ queryKey: ["alert-events"] });
          invalidateOpenChangeRiskQueries();
          invalidateOpenIncidentRecoveryQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          pushNotification({ severity: "success", message: `Maintenance ended: ${event.payload.reason}` });
          break;
        }

        case "INCIDENT_CORRELATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.rootIncidents });
          if (event.payload.isNew) {
            pushNotification({
              severity: "warning",
              message: `Correlated incident: ${event.payload.causeCheckType} affecting ${event.payload.affectedProjectIds.length} projects`,
            });
          }
          break;
        }

        // Phase 11 Teil 9 "Realtime" - AUTOMATION_* deckt den vollen
        // Lebenszyklus jeder Automatisierungs-Ausfuehrung ab (Automation
        // Center + Mini City). SELF_HEALING_* ist dieselbe Ausfuehrung
        // zusaetzlich markiert, wenn sie vollstaendig automatisch lief -
        // nur Cache-Invalidierung dort, keine zweite Snackbar fuer denselben
        // Vorgang.
        case "AUTOMATION_STARTED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
          void queryClient.invalidateQueries({ queryKey: ["automation-executions"] });
          // Phase 21 Auftragspunkt 10 "Automation Integration" - falls diese
          // Ausfuehrung an einen Incident geknuepft ist (action.incidentId),
          // taucht sie auch in dessen Timeline auf.
          if (event.payload.action.incidentId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(event.payload.action.incidentId) });
          }
          invalidateOpenIncidentRecoveryQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          break;
        }

        case "AUTOMATION_FINISHED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
          void queryClient.invalidateQueries({ queryKey: ["automation-executions"] });
          void queryClient.invalidateQueries({ queryKey: ["automation-analytics"] });
          if (event.payload.action.incidentId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(event.payload.action.incidentId) });
          }
          invalidateOpenIncidentRecoveryQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          invalidateReliabilityQueries();
          pushNotification({ severity: "success", message: `Automation finished: ${event.payload.action.action}` });
          break;
        }

        case "AUTOMATION_FAILED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
          void queryClient.invalidateQueries({ queryKey: ["automation-executions"] });
          void queryClient.invalidateQueries({ queryKey: ["automation-analytics"] });
          if (event.payload.action.incidentId) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(event.payload.action.incidentId) });
          }
          invalidateOpenIncidentRecoveryQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          pushNotification({ severity: "error", message: `Automation failed: ${event.payload.action.action}` });
          break;
        }

        case "AUTOMATION_WAITING_APPROVAL": {
          void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
          pushNotification({ severity: "warning", message: `Automation waiting for approval: ${event.payload.action}` });
          break;
        }

        case "AUTOMATION_APPROVED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
          break;
        }

        case "AUTOMATION_REJECTED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
          break;
        }

        // Phase 18 - Automation-Regeln wurden seit Phase 9-11 ueberhaupt
        // nicht live aktualisiert (weder ueber die Browser-UI noch, jetzt
        // neu, die externe API - dieselben Events fuer beide Ausloeser,
        // siehe realtime/events.ts im Backend). Automation Center und Mini
        // City nutzen denselben Query-Key ["automation-rules", projectId]
        // (siehe hooks/queryKeys.ts), daher genuegt eine Invalidierung des
        // Basis-Keys fuer alle Ansichten.
        case "AUTOMATION_RULE_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
          pushNotification({ severity: "info", message: `Automation rule created: ${event.payload.name}` });
          break;
        }

        case "AUTOMATION_RULE_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
          break;
        }

        case "AUTOMATION_RULE_DELETED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
          pushNotification({ severity: "info", message: `Automation rule deleted: ${event.payload.name}` });
          break;
        }

        // Phase 17 - ein externer API-Aufruf hat versucht, eine noch
        // nicht genehmigte Aktion auszufuehren, und wurde abgelehnt (siehe
        // routes/v1/automation.routes.ts). Kein Datenwechsel (die Aktion
        // bleibt PROPOSED), aber ein sichtbarer Hinweis fuer Operatoren,
        // dass diese Aktion Aufmerksamkeit braucht.
        case "API_AUTOMATION_EXECUTION_REQUESTED": {
          pushNotification({
            severity: "warning",
            message: `External API tried to execute "${event.payload.action}" - still awaiting approval`,
          });
          break;
        }

        case "SELF_HEALING_STARTED":
        case "SELF_HEALING_FINISHED":
        case "SELF_HEALING_FAILED": {
          void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
          void queryClient.invalidateQueries({ queryKey: ["automation-executions"] });
          void queryClient.invalidateQueries({ queryKey: ["automation-analytics"] });
          break;
        }

        case "EXECUTION_LOG": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.automationExecutionLogs(event.payload.executionId) });
          break;
        }

        // Phase 13 Teil 1 "Monitoring Agents" - AGENT_HEARTBEAT feuert bei
        // jedem Scheduler-Tick (~30s), daher keine Snackbar (waere staendiges
        // Rauschen), nur eine gezielte Cache-Invalidierung.
        case "AGENT_ONLINE": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.monitoringAgents });
          pushNotification({ severity: "success", message: `Monitoring agent online: ${event.payload.name}` });
          break;
        }

        case "AGENT_OFFLINE": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.monitoringAgents });
          pushNotification({ severity: "warning", message: `Monitoring agent offline: ${event.payload.name}` });
          break;
        }

        case "AGENT_HEARTBEAT": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.monitoringAgents });
          void queryClient.invalidateQueries({ queryKey: queryKeys.monitoringAgent(event.payload.id) });
          break;
        }

        case "BACKUP_STARTED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.backups });
          break;
        }

        case "BACKUP_FINISHED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.backups });
          pushNotification({ severity: "success", message: `Backup created: ${event.payload.label}` });
          break;
        }

        case "RESTORE_STARTED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.backups });
          break;
        }

        case "RESTORE_FINISHED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.backups });
          pushNotification({ severity: "success", message: `Backup #${event.payload.backupId} restored` });
          break;
        }

        case "STATUSPAGE_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.publicStatusPage });
          break;
        }

        case "AUDIT_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
          break;
        }

        case "FORECAST_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["forecast", event.payload.metric] });
          break;
        }

        // Phase 14 "Enterprise Multi-Node Cluster, Remote Agents & High
        // Availability" - alle Cluster-Events invalidieren sowohl die
        // Phase-13-Agentenliste als auch die Cluster-spezifischen Views
        // (Health/Distribution/Analytics), da eine Aenderung hier
        // typischerweise beide betrifft.
        case "AGENT_REGISTERED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.monitoringAgents });
          void queryClient.invalidateQueries({ queryKey: ["cluster"] });
          pushNotification({ severity: "success", message: `Agent registered: ${event.payload.name}` });
          break;
        }

        case "AGENT_UPDATED":
        case "AGENT_PAUSED":
        case "AGENT_RESUMED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.monitoringAgents });
          void queryClient.invalidateQueries({ queryKey: ["cluster"] });
          break;
        }

        case "AGENT_REMOVED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.monitoringAgents });
          void queryClient.invalidateQueries({ queryKey: ["cluster"] });
          pushNotification({ severity: "info", message: `Agent removed: ${event.payload.agentName}` });
          break;
        }

        case "CHECK_REASSIGNED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.clusterDistribution });
          void queryClient.invalidateQueries({ queryKey: ["cluster", "events"] });
          break;
        }

        case "FAILOVER_STARTED": {
          void queryClient.invalidateQueries({ queryKey: ["cluster"] });
          pushNotification({ severity: "error", message: event.payload.message });
          break;
        }

        case "FAILOVER_FINISHED": {
          void queryClient.invalidateQueries({ queryKey: ["cluster"] });
          pushNotification({ severity: "success", message: event.payload.message });
          break;
        }

        case "CLUSTER_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.clusterHealth });
          void queryClient.invalidateQueries({ queryKey: queryKeys.clusterOverview });
          break;
        }

        case "ROLLING_UPDATE_STARTED": {
          void queryClient.invalidateQueries({ queryKey: ["cluster", "rolling-updates"] });
          pushNotification({ severity: "info", message: event.payload.message });
          break;
        }

        case "ROLLING_UPDATE_FINISHED": {
          void queryClient.invalidateQueries({ queryKey: ["cluster", "rolling-updates"] });
          pushNotification({ severity: event.payload.message.includes("FAILED") ? "error" : "success", message: event.payload.message });
          break;
        }

        case "AGENT_LOG_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["cluster", "logs"] });
          break;
        }

        // Phase 15 "Enterprise Platform, Multi-Tenant SaaS & Global
        // Operations".
        case "ORGANIZATION_CREATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
          void queryClient.invalidateQueries({ queryKey: queryKeys.platformOverview });
          pushNotification({ severity: "success", message: `Organization created: ${event.payload.name}` });
          break;
        }

        case "ORGANIZATION_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
          void queryClient.invalidateQueries({ queryKey: queryKeys.platformOverview });
          break;
        }

        case "TEAM_CREATED":
        case "TEAM_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["teams"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.platformOverview });
          break;
        }

        case "API_KEY_CREATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(event.payload.organizationId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.platformOverview });
          break;
        }

        case "API_KEY_REVOKED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(event.payload.organizationId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.platformOverview });
          break;
        }

        case "SERVICE_ACCOUNT_CREATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.serviceAccounts(event.payload.organizationId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.platformOverview });
          break;
        }

        case "WEBHOOK_DELIVERED":
        case "WEBHOOK_FAILED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.webhookDeliveries(event.payload.webhookId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.platformOverview });
          break;
        }

        case "TENANT_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.tenantAnalytics(event.payload.organizationId) });
          break;
        }

        // Phase 16 Auftragspunkt 13/14 "Realtime"/"Usage Warning" - echte,
        // seltene Schwellenwert-Ueberschreitungen der Tages-Quota (siehe
        // middleware/api-key-auth.ts im Backend), kein Event pro einzelnem
        // API-Request. Aktualisiert Usage-/Overview-Widgets sofort statt
        // auf das naechste 30s-Polling zu warten.
        case "API_QUOTA_WARNING": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "usage"] });
          pushNotification({
            severity: "warning",
            message: `API quota at ${event.payload.thresholdPercent}% (${event.payload.requestsToday}/${event.payload.dailyLimit} requests today)`,
          });
          break;
        }

        case "API_QUOTA_EXCEEDED": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "usage"] });
          pushNotification({
            severity: "error",
            message: `API daily quota exceeded (${event.payload.requestsToday}/${event.payload.dailyLimit} requests)`,
          });
          break;
        }

        // Phase 16 (2. Iteration) Auftragspunkt 9 "Realtime".
        case "API_KEY_ROTATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(event.payload.organizationId) });
          pushNotification({ severity: "info", message: `API key rotated: ${event.payload.description}` });
          break;
        }

        case "API_KEY_EXPIRED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(event.payload.organizationId) });
          pushNotification({ severity: "warning", message: "An API key was used after its expiry date and was rejected" });
          break;
        }

        // Gedrosselt auf max. 1x/5s pro Organisation im Backend (siehe
        // core/api-usage-broadcast.ts) - hier daher ohne zusaetzliche
        // Debounce-Logik im Frontend uebernehmbar.
        case "API_USAGE_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "usage"] });
          break;
        }

        // Phase 19 "Enterprise Observability, API Analytics & Operational
        // Intelligence" - echte, hysteresegesteuerte Warnungen (siehe
        // core/api-usage-intelligence.ts im Backend), daher im Unterschied
        // zu API_USAGE_UPDATED oben MIT Snackbar (selten genug, um keinen
        // Spam zu erzeugen). Invalidiert dasselbe "platform"/"api-analytics"-
        // Praefix wie die neue API-Analytics-Seite (hooks/queryKeys.ts).
        case "API_USAGE_THRESHOLD_WARNING": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "api-analytics"] });
          pushNotification({
            severity: "warning",
            message: `Elevated API error rate: ${event.payload.thresholdPercent}% over the last ${event.payload.windowMinutes} minutes`,
          });
          break;
        }

        case "API_USAGE_SPIKE_DETECTED": {
          void queryClient.invalidateQueries({ queryKey: ["platform", "api-analytics"] });
          pushNotification({
            severity: "warning",
            message: `API request spike detected: ${event.payload.recentRequests} requests in ${event.payload.windowMinutes} minutes (${event.payload.thresholdPercent}% of baseline)`,
          });
          break;
        }

        // Phase 28 "Enterprise Maintenance Windows, Change Management &
        // Deployment Risk" - ["changes"]-Praefix deckt Liste + jede
        // Filterkombination ab (siehe hooks/queryKeys.ts); zusaetzlich
        // gezielt das betroffene Detail sowie ggf. eine offene
        // Incident-Detailseite (change-context leitet sich aus Change +
        // Maintenance ab, siehe routes/incidents.routes.ts).
        case "CHANGE_CREATED": {
          void queryClient.invalidateQueries({ queryKey: ["changes"] });
          pushNotification({ severity: "info", message: `Change created: ${event.payload.title}` });
          break;
        }

        case "CHANGE_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: ["changes"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.change(event.payload.id) });
          invalidateProblemsQueries();
          break;
        }

        case "CHANGE_STARTED": {
          void queryClient.invalidateQueries({ queryKey: ["changes"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.change(event.payload.id) });
          void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
          void queryClient.invalidateQueries({ queryKey: ["incidents", "detail"], predicate: (q) => q.queryKey.includes("change-context") });
          invalidateOpenIncidentRecoveryQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          invalidateReliabilityQueries();
          invalidateProblemsQueries();
          invalidateResilienceQueries();
          pushNotification({ severity: "warning", message: `Change started: ${event.payload.title}` });
          break;
        }

        case "CHANGE_COMPLETED": {
          void queryClient.invalidateQueries({ queryKey: ["changes"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.change(event.payload.id) });
          void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
          void queryClient.invalidateQueries({ queryKey: ["incidents", "detail"], predicate: (q) => q.queryKey.includes("change-context") });
          invalidateOpenIncidentRecoveryQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          invalidateReliabilityQueries();
          // Phase 36 - ein abgeschlossener Change kann die
          // Remediation-Effectiveness-Analyse eines verknuepften Problems
          // direkt betreffen (executionTimestamp wird erst mit
          // actualEndAt/actualStartAt final, siehe core/remediation-
          // effectiveness.ts).
          invalidateProblemsQueries();
          invalidateResilienceQueries();
          pushNotification({ severity: "success", message: `Change completed: ${event.payload.title}` });
          break;
        }

        case "CHANGE_CANCELLED": {
          void queryClient.invalidateQueries({ queryKey: ["changes"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.change(event.payload.id) });
          void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
          pushNotification({ severity: "info", message: `Change cancelled: ${event.payload.title}` });
          break;
        }

        case "CHANGE_APPROVED": {
          void queryClient.invalidateQueries({ queryKey: ["changes"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.change(event.payload.id) });
          pushNotification({ severity: "success", message: `Change approved: ${event.payload.title}` });
          break;
        }

        case "CHANGE_REJECTED": {
          void queryClient.invalidateQueries({ queryKey: ["changes"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.change(event.payload.id) });
          pushNotification({ severity: "error", message: `Change rejected: ${event.payload.title}` });
          break;
        }

        // Phase 28 (Fortsetzung) "Enterprise Change Management & Deployment
        // Intelligence" - derselbe Invalidierungs-Umfang wie CHANGE_COMPLETED
        // (auch ein fehlgeschlagener Change beendet sein Wartungsfenster).
        case "CHANGE_FAILED": {
          void queryClient.invalidateQueries({ queryKey: ["changes"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.change(event.payload.id) });
          void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
          void queryClient.invalidateQueries({ queryKey: ["incidents", "detail"], predicate: (q) => q.queryKey.includes("change-context") });
          invalidateReliabilityQueries();
          invalidateResilienceQueries();
          pushNotification({ severity: "error", message: `Change failed: ${event.payload.title}` });
          break;
        }

        // Phase 31 "Enterprise Change/Incident Communication & Stakeholder
        // Notification Intelligence" Auftragspunkt 8 "Realtime" - History-
        // Query fuer genau diesen Incident invalidieren, damit ein zweiter
        // geoeffneter Browser-Kontext die neue Kommunikation ohne Reload sieht.
        case "INCIDENT_COMMUNICATION_CREATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentCommunications(String(event.payload.incidentId)) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(String(event.payload.incidentId)) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentCommandOverview(String(event.payload.incidentId)) });
          break;
        }

        // Phase 32 "Enterprise Incident Command Center & Operational
        // Coordination" Auftragspunkt 8 "Realtime" - ein zweiter geoeffneter
        // Browser-Kontext sieht Rollen-/Checklist-Aenderungen ohne Reload.
        case "INCIDENT_COMMAND_UPDATED": {
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentCommand(String(event.payload.incidentId)) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentCommandOverview(String(event.payload.incidentId)) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(String(event.payload.incidentId)) });
          break;
        }

        // Phase 35 "Enterprise Problem Management & Root-Cause Intelligence"
        // Auftragspunkt 22 "Realtime" - EIN Event fuer alle mutierenden
        // Problem-Aktionen (Create/Update/Delete/Incident-Link/Unlink/
        // Change-Link/Unlink), dasselbe Praefix-Invalidierungs-Prinzip wie
        // Reliability (Phase 33). Zusaetzlich ein offenes Incident-Command-
        // Overview invalidiert (zeigt seit dieser Phase "Related Problems"),
        // da das Event keine incidentId traegt und daher nicht gezielt
        // invalidiert werden kann.
        case "PROBLEM_UPDATED": {
          invalidateProblemsQueries();
          invalidateOpenIncidentCommandOverviewQueries();
          invalidateResilienceQueries();
          break;
        }

        // Phase 38 "Enterprise Resilience Alerting & Notification
        // Intelligence" - der Server meldet nur echte Uebergaenge (siehe
        // core/resilience-alerting.ts), daher hier immer ein Toast, kein
        // zusaetzlicher Client-seitiger Vergleich noetig.
        case "RESILIENCE_STATUS_CHANGED": {
          invalidateResilienceQueries();
          const label = event.payload.serviceName ?? event.payload.projectName;
          const degrading = RESILIENCE_RANK[event.payload.newStatus] > RESILIENCE_RANK[event.payload.previousStatus ?? "HEALTHY"];
          pushNotification({
            severity: degrading ? (event.payload.newStatus === "CRITICAL" ? "error" : "warning") : "success",
            message: degrading
              ? `Resilience degraded: ${label} is now ${event.payload.newStatus}`
              : `Resilience recovered: ${label} is now ${event.payload.newStatus}`,
          });
          break;
        }
      }
    };

    const unsubscribe = subscribeRealtimeEvents(handleEvent);
    return () => {
      unsubscribe();
      if (analyticsInvalidateTimer.current !== undefined) {
        clearTimeout(analyticsInvalidateTimer.current);
        analyticsInvalidateTimer.current = undefined;
      }
    };
  }, [queryClient]);

  const dismissNotification = (id: string): void => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  };

  return { status, notifications, dismissNotification };
}
