import { projects } from "../config/projects.config";
import { getChecker } from "../checks/check-registry";
import { logger } from "./logger";
import { getHistory, getLatestForCheck, insertResult } from "../db/results.repository";
import { openIncident, resolveOpenIncident } from "../db/incidents.repository";
import { addTimelineEvent } from "../db/incident-timeline.repository";
import { recordAnalysis } from "../db/ai.repository";
import { analyzeIncident } from "../ai/incident-analyzer";
import { buildIncidentAnalysisContext } from "../incidents/incident-context";
import { severityForCheck, buildIncidentTitle } from "../incidents/incident-classifier";
import { suggestAutomationAction } from "../incidents/automation-suggestions";
import { correlateIncidents } from "../incidents/incident-correlation";
import { proposeAutomationAction } from "../db/automation.repository";
import { buildDiagnosticSnapshotContent } from "../incidents/diagnostic-snapshot";
import { createDiagnosticSnapshot } from "../db/diagnostic-snapshots.repository";
import { buildNotificationPayload } from "../notifications/message-builder";
import { notifyOffline } from "../notifications/notification.service";
import { dispatchNotificationEvent } from "../notifications/notification-event.service";
import { getDashboardSummary, getProjectHealth } from "../db/dashboard.repository";
import { getActiveMaintenanceWindow } from "../db/maintenance.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { evaluateProjectAlertRules } from "../alerts/alert-evaluator";
import { evaluateAutomationTriggers } from "../automation/automation-engine";
import { heartbeatLocalAgent, evaluateAgentCapacityIfDue } from "./local-agent";
import { heartbeatLocalClusterNode } from "./cluster-node";
import { getAssignedAgentId, refreshAssignments } from "./distributed-scheduler";
import { detectAndHandleFailover } from "./failover";
import { dispatchWebhookEvent } from "./webhook-dispatch";
import { notifyImpactIfSignificant } from "./topology";
import { processPendingWebhookDeliveries } from "./webhook-delivery";
import { cleanupExpiredIdempotencyKeysIfDue } from "./idempotency-cleanup";
import { checkApiUsageIntelligenceIfDue } from "./api-usage-intelligence";
import { evaluateSlosIfDue } from "./slo-evaluator";
import { evaluateResilienceAlertsIfDue } from "./resilience-alerting";
import { evaluateProactiveRiskAlertsIfDue } from "./proactive-risk-alerting";
import { evaluateAutomationOutcomesIfDue, evaluateAutomationOutcomeDurabilityIfDue } from "./automation-outcome-verification";
import { evaluateIncidentEscalations, broadcastEscalationResolvedIfNeeded } from "./incident-escalation";
import { getServiceByProjectId } from "../db/services.repository";
import type { CheckConfig, ProjectConfig } from "../types/project.types";
import type { CheckResult } from "../types/check-result.types";
import { HealthStatus } from "../types/health.types";
import type { MaintenanceWindow } from "../types/maintenance.types";

export class MonitorService {
  private readonly projects: ProjectConfig[];
  // Fuer den HEALTH_CHANGED-Realtime-Event: nur bei tatsaechlichem
  // Statuswechsel senden, nicht bei jedem Scheduler-Durchlauf. undefined vor
  // dem ersten Durchlauf verhindert ein falsches "Aenderung" beim Start.
  private previousOverallStatus: HealthStatus | undefined;
  // Analog fuer MAINTENANCE_STARTED/MAINTENANCE_ENDED (Phase 9) - haelt das
  // zuletzt aktive Fenster je Projekt, damit MAINTENANCE_ENDED mit den
  // echten Daten des soeben beendeten Fensters gesendet werden kann (statt
  // nur einem Boolean), und ein Event genau beim Uebergang entsteht statt
  // bei jedem Tick waehrend das Fenster laeuft.
  private readonly activeMaintenanceByProject = new Map<string, MaintenanceWindow>();
  // Phase 11 Teil 1: analog zu previousOverallStatus, aber PRO Projekt - fuer
  // die PROJECT_CRITICAL/PROJECT_WARNING-Automatisierungs-Trigger, die nur
  // beim Uebergang ausgeloest werden sollen, nicht bei jedem Tick waehrend
  // der Status unveraendert bleibt.
  private readonly previousProjectStatusByProject = new Map<string, HealthStatus>();

  constructor(projectConfigs: ProjectConfig[] = projects) {
    this.projects = projectConfigs;
  }

  getProjects(): ProjectConfig[] {
    return this.projects;
  }

  getProject(id: string): ProjectConfig | undefined {
    return this.projects.find((project) => project.id === id);
  }

  // Phase 11 Teil 2 "Self Healing" (RESTART_MONITOR): verwirft den intern
  // gemerkten Wartungsfenster-Zustand fuer dieses Projekt, damit
  // syncMaintenanceState() den aktuellen Zustand beim naechsten Tick komplett
  // neu erkennt (z.B. ein zwischenzeitlich verpasster MAINTENANCE_ENDED-
  // Uebergang) statt auf dem zuletzt gesehenen aufzubauen.
  resetProjectState(projectId: string): void {
    this.activeMaintenanceByProject.delete(projectId);
  }

  async runCheck(project: ProjectConfig, check: CheckConfig, maintenanceWindow: MaintenanceWindow | undefined): Promise<CheckResult> {
    const checker = getChecker(check.type);

    const result: CheckResult = checker
      ? await checker.run(project, check)
      : {
          checkId: check.id,
          projectId: project.id,
          type: check.type,
          status: "ERROR",
          error: `Check-Typ "${check.type}" ist noch nicht implementiert`,
          checkedAt: new Date().toISOString(),
        };

    const previous = await getLatestForCheck(check.id);
    // "Monitoring laeuft weiter, Daten bleiben erhalten" (Auftragspunkt 5) -
    // check_results wird IMMER geschrieben, unabhaengig von einem aktiven
    // Wartungsfenster. Nur Incident-Eroeffnung/Benachrichtigung wird unten
    // unterdrueckt.
    await insertResult(result, getAssignedAgentId(check.id));
    broadcast(createEvent(RealtimeEventType.CHECK_UPDATED, result));

    const isFailing = result.status === "ERROR" || result.status === "OFFLINE";
    const isRecovered = result.status === "ONLINE";

    if (isFailing && maintenanceWindow) {
      logger.info("Ausfall waehrend Wartungsfenster unterdrueckt (kein Incident, keine Benachrichtigung)", {
        project: project.id,
        check: check.id,
        maintenanceWindowId: maintenanceWindow.id,
      });
    } else if (isFailing) {
      // Phase 11 Teil 1 - eigener try/catch, ein Fehler in der Regel-
      // Auswertung darf das eigentliche Monitoring niemals unterbrechen.
      try {
        await evaluateAutomationTriggers("CHECK_FAILED", project.id, {
          checkId: check.id,
          checkType: check.type,
        });
      } catch (err) {
        logger.error("Automatisierungs-Trigger CHECK_FAILED fehlgeschlagen", {
          checkId: check.id,
          error: err instanceof Error ? err.message : "Unbekannter Fehler",
        });
      }

      // Phase 27 "Enterprise On-Call & Escalation Management" - loest die
      // fuer dieses Projekt ggf. hinterlegte Service->Escalation-Policy auf
      // (Phase 23 Service Catalog ist die bestehende Owner-Kontext-
      // Ressource, kein neues "Kontext"-Konzept). Best-effort: ein
      // fehlendes/geloeschtes Service darf die Incident-Eroeffnung selbst
      // nie verhindern.
      const service = await getServiceByProjectId(project.id).catch(() => undefined);

      // openIncident() ist ein No-Op, wenn fuer diesen Check bereits ein
      // offener Incident existiert (idx_incidents_open_per_check) - dann
      // ist die KI-Analyse schon vorhanden und wird nicht erneut angefragt.
      const incident = await openIncident({
        projectId: project.id,
        checkId: check.id,
        severity: severityForCheck(check.type, result.status),
        title: buildIncidentTitle(project, check, result),
        ...(result.error ? { description: result.error } : {}),
        ...(service?.escalationPolicyId ? { escalationPolicyId: service.escalationPolicyId } : {}),
      });

      if (incident) {
        logger.warn("Incident eroeffnet", {
          incidentId: incident.id,
          project: project.id,
          check: check.id,
          severity: incident.severity,
        });
        broadcast(createEvent(RealtimeEventType.INCIDENT_CREATED, incident));
        broadcast(createEvent(RealtimeEventType.STATUSPAGE_UPDATED, { generatedAt: new Date().toISOString() }));
        void dispatchWebhookEvent("INCIDENT_CREATED", incident);
        // Phase 25 "Enterprise Service Dependency Intelligence & Impact
        // Analysis" Auftragspunkt "Automatische Integration" - fire-and-
        // forget wie die Aufrufe direkt darueber, blockiert den Check-Loop
        // nicht (core/topology.ts#notifyImpactIfSignificant wirft nie).
        void notifyImpactIfSignificant(project.id, "INCIDENT", `New incident: ${incident.title}`);
        // Phase 21 Auftragspunkt 4 "Incident Timeline" - erster Eintrag der
        // Erzaehlung dieses Incidents.
        void addTimelineEvent({
          incidentId: incident.id,
          eventType: "CREATED",
          message: incident.title,
          metadata: { checkId: check.id, checkType: check.type, severity: incident.severity },
        });

        try {
          await evaluateAutomationTriggers("INCIDENT_CREATED", project.id, {
            incidentId: incident.id,
            checkId: check.id,
            checkType: check.type,
            severity: incident.severity,
          });
        } catch (err) {
          logger.error("Automatisierungs-Trigger INCIDENT_CREATED fehlgeschlagen", {
            incidentId: incident.id,
            error: err instanceof Error ? err.message : "Unbekannter Fehler",
          });
        }

        // Auftragspunkt 6 "Diagnostic Snapshots" - bei jeder Incident-
        // Eroeffnung den kompletten Beobachtungszustand des Projekts
        // sichern. Eigener try/catch, damit ein Fehler hier (z.B. DB-
        // Kurzausfall) niemals die eigentliche Incident-Behandlung/KI-
        // Analyse unten verhindert.
        try {
          const snapshotContent = await buildDiagnosticSnapshotContent(project.id);
          await createDiagnosticSnapshot({
            projectId: project.id,
            incidentId: incident.id,
            healthScore: snapshotContent.healthScore,
            snapshot: snapshotContent,
          });
        } catch (err) {
          logger.error("Diagnostic Snapshot konnte nicht erstellt werden", {
            incidentId: incident.id,
            error: err instanceof Error ? err.message : "Unbekannter Fehler",
          });
        }

        const history = await getHistory(check.id, 5);
        const context = await buildIncidentAnalysisContext(project.id, check.id, check.type);
        const analysis = await analyzeIncident(project, result, history, context);
        const analysisRecord = await recordAnalysis(incident.id, analysis);
        broadcast(
          createEvent(RealtimeEventType.AI_ANALYSIS_CREATED, {
            ...analysisRecord,
            projectId: project.id,
            checkId: check.id,
          }),
        );

        // Self-Healing-Vorbereitung (Auftragspunkt 9) - nur fuer CRITICAL,
        // um die Tabelle nicht mit Vorschlaegen fuer jeden kleinen Fehler zu
        // fluten. Reine Beobachtung/Vorschlag, keine Ausfuehrung. Eigener
        // try/catch, damit ein Fehler hier niemals den Check-Durchlauf
        // abbricht (das eigentliche Monitoring hat bereits stattgefunden).
        if (incident.severity === "CRITICAL") {
          try {
            await proposeAutomationAction({
              projectId: project.id,
              incidentId: incident.id,
              action: suggestAutomationAction(check.type),
              trigger: `Incident #${incident.id}: ${incident.title}`,
            });
          } catch (err) {
            logger.error("Automatisierungsvorschlag fehlgeschlagen", {
              incidentId: incident.id,
              error: err instanceof Error ? err.message : "Unbekannter Fehler",
            });
          }
        }

        if (previous?.status === "ONLINE" && result.status === "OFFLINE") {
          // Phase 21 Auftragspunkt 5/19 "Notification Orchestration"/
          // "Performance" - echter, gefundener Bug: notifyOffline() sendet
          // pro Kanal eine ECHTE Netzwerkanfrage (u.a. SMTP fuer E-Mail,
          // siehe notifications/email.channel.ts), war hier aber synchron
          // AWAITed - ein langsamer/haengender Mail-Server haette den
          // gesamten Scheduler-Tick (und damit das Monitoring nachfolgender
          // Projekte) blockiert. Fire-and-forget wie ueberall sonst in
          // diesem Codepfad (z.B. dispatchWebhookEvent).
          void notifyOffline(buildNotificationPayload(project, result, analysis), incident.id);
        }
      }
    } else if (isRecovered) {
      // Eine Wiederherstellung wird nie unterdrueckt, auch nicht waehrend
      // eines Wartungsfensters - ein zuvor (vor dem Fenster) eroeffneter
      // Incident soll trotzdem sauber geschlossen werden.
      const resolvedIncident = await resolveOpenIncident(check.id);
      if (resolvedIncident) {
        logger.info("Incident geschlossen", {
          incidentId: resolvedIncident.id,
          project: project.id,
          check: check.id,
        });
        broadcast(createEvent(RealtimeEventType.INCIDENT_RESOLVED, resolvedIncident));
        broadcast(createEvent(RealtimeEventType.STATUSPAGE_UPDATED, { generatedAt: new Date().toISOString() }));
        void dispatchWebhookEvent("INCIDENT_RESOLVED", resolvedIncident);
        broadcastEscalationResolvedIfNeeded(resolvedIncident);
        void addTimelineEvent({
          incidentId: resolvedIncident.id,
          eventType: "RESOLVED",
          message: "Automatisch geloest - Check ist wieder online",
          metadata: { checkId: check.id },
        });

        try {
          await evaluateAutomationTriggers("CHECK_RECOVERED", project.id, { checkId: check.id, checkType: check.type });
          await evaluateAutomationTriggers("INCIDENT_RESOLVED", project.id, {
            incidentId: resolvedIncident.id,
            checkId: check.id,
            checkType: check.type,
            severity: resolvedIncident.severity,
          });
        } catch (err) {
          logger.error("Automatisierungs-Trigger CHECK_RECOVERED/INCIDENT_RESOLVED fehlgeschlagen", {
            incidentId: resolvedIncident.id,
            error: err instanceof Error ? err.message : "Unbekannter Fehler",
          });
        }
      }
    }

    if (result.status === "ONLINE") {
      logger.info("Check erfolgreich", {
        project: project.id,
        check: check.id,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
      });
    } else {
      logger.warn("Check fehlgeschlagen", {
        project: project.id,
        check: check.id,
        status: result.status,
        error: result.error,
      });
    }

    return result;
  }

  // Broadcastet MAINTENANCE_STARTED/MAINTENANCE_ENDED genau beim Uebergang
  // (nicht bei jedem Tick waehrend das Fenster laeuft) - immer mit den
  // echten Daten des betroffenen Fensters, nie mit erfundenen Platzhaltern.
  private async syncMaintenanceState(project: ProjectConfig, maintenanceWindow: MaintenanceWindow | undefined): Promise<void> {
    const previousWindow = this.activeMaintenanceByProject.get(project.id);

    if (maintenanceWindow && !previousWindow) {
      broadcast(createEvent(RealtimeEventType.MAINTENANCE_STARTED, maintenanceWindow));
      broadcast(createEvent(RealtimeEventType.STATUSPAGE_UPDATED, { generatedAt: new Date().toISOString() }));
      this.activeMaintenanceByProject.set(project.id, maintenanceWindow);
      // Phase 21 Auftragspunkt 5/19 - fire-and-forget, siehe Kommentar bei
      // notifyOffline() oben (derselbe Grund: echte Netzwerkkanaele duerfen
      // den Scheduler-Tick nicht blockieren).
      void dispatchNotificationEvent({
        type: "MAINTENANCE_STARTED",
        projectId: project.id,
        projectName: project.name,
        severity: "INFO",
        title: `Wartungsfenster gestartet: ${project.name}`,
        message: `Grund: ${maintenanceWindow.reason}. Ende geplant: ${maintenanceWindow.endsAt}.`,
        timestamp: new Date().toISOString(),
        metadata: { maintenanceWindowId: maintenanceWindow.id },
      });
      await evaluateAutomationTriggers("MAINTENANCE_STARTED", project.id, { maintenanceWindowId: maintenanceWindow.id });
    } else if (!maintenanceWindow && previousWindow) {
      broadcast(createEvent(RealtimeEventType.MAINTENANCE_ENDED, { ...previousWindow, active: false }));
      broadcast(createEvent(RealtimeEventType.STATUSPAGE_UPDATED, { generatedAt: new Date().toISOString() }));
      this.activeMaintenanceByProject.delete(project.id);
      void dispatchNotificationEvent({
        type: "MAINTENANCE_ENDED",
        projectId: project.id,
        projectName: project.name,
        severity: "INFO",
        title: `Wartungsfenster beendet: ${project.name}`,
        message: `Das Wartungsfenster ("${previousWindow.reason}") ist beendet.`,
        timestamp: new Date().toISOString(),
        metadata: { maintenanceWindowId: previousWindow.id },
      });
      await evaluateAutomationTriggers("MAINTENANCE_ENDED", project.id, { maintenanceWindowId: previousWindow.id });
    } else if (maintenanceWindow) {
      this.activeMaintenanceByProject.set(project.id, maintenanceWindow);
    }
  }

  async runAllChecks(): Promise<void> {
    // Phase 13 Teil 1 "Monitoring Agents" - derselbe Scheduler-Tick meldet
    // gleich mit, statt eines eigenen Timers. Eigener try/catch: ein
    // Heartbeat-Fehler darf niemals das eigentliche Monitoring verhindern.
    try {
      await heartbeatLocalAgent();
    } catch (err) {
      logger.error("Agent-Heartbeat fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 14 "High Availability"/"Distributed Scheduler"/"Agent Failover" -
    // derselbe Scheduler-Tick wie oben, jeweils eigener try/catch: ein
    // Fehler in einem dieser drei darf weder die anderen noch das
    // eigentliche Check-Monitoring unten verhindern.
    try {
      await heartbeatLocalClusterNode();
    } catch (err) {
      logger.error("Cluster-Node-Heartbeat fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
    // Failover VOR der regulaeren Neuzuweisung: erkennt und meldet einen
    // Ausfall explizit (FAILOVER_STARTED/FINISHED, Recovery-Zeit-Messung).
    // refreshAssignments() wuerde denselben Check ohnehin beim naechsten
    // Durchlauf von einem OFFLINE-Agenten wegverteilen (eligibleAgents()
    // schliesst ihn aus) - die explizite Reihenfolge stellt sicher, dass
    // die Umverteilung als benanntes Failover-Ereignis sichtbar wird statt
    // in der regulaeren Zuweisung unterzugehen.
    try {
      await detectAndHandleFailover();
    } catch (err) {
      logger.error("Failover-Erkennung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
    try {
      await refreshAssignments();
    } catch (err) {
      logger.error("Verteilte Check-Zuweisung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 15 Teil 7 "Webhooks" - Retry Queue wird bei jedem bestehenden
    // Scheduler-Tick verarbeitet, kein eigener Poller.
    try {
      await processPendingWebhookDeliveries();
    } catch (err) {
      logger.error("Webhook-Zustellungsverarbeitung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 17 Auftragspunkt 20 "Performance" - Idempotency-Key-Bereinigung
    // im selben bestehenden Tick, intern selbst auf 1x/Stunde gedrosselt
    // (siehe core/idempotency-cleanup.ts).
    try {
      await cleanupExpiredIdempotencyKeysIfDue();
    } catch (err) {
      logger.error("Idempotency-Key-Bereinigung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 19 Auftragspunkt 5 "Realtime" - API-Usage-Operational-
    // Intelligence-Check im selben bestehenden Tick, intern selbst auf
    // 1x/2min gedrosselt (siehe core/api-usage-intelligence.ts) - kein
    // eigener Poller.
    try {
      await checkApiUsageIntelligenceIfDue();
    } catch (err) {
      logger.error("API-Usage-Intelligence-Check fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 22 Auftragspunkt 21 "Background Evaluation" - SLO-Auswertung im
    // selben bestehenden Tick, intern selbst auf 1x/2min gedrosselt (siehe
    // core/slo-evaluator.ts) - kein eigener Scheduler.
    try {
      await evaluateSlosIfDue();
    } catch (err) {
      logger.error("SLO-Auswertung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 38 "Enterprise Resilience Alerting & Notification Intelligence" -
    // im selben bestehenden Tick, intern selbst auf 5min gedrosselt (siehe
    // core/resilience-alerting.ts) - kein eigener Scheduler, identisches
    // Muster zu evaluateSlosIfDue() direkt darueber.
    try {
      await evaluateResilienceAlertsIfDue();
    } catch (err) {
      logger.error("Resilience-Alert-Auswertung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
    // Intelligence" - im selben bestehenden Tick, intern selbst auf 15min
    // gedrosselt (siehe core/proactive-risk-alerting.ts), kein eigener
    // Scheduler, identisches Muster zu evaluateResilienceAlertsIfDue()
    // direkt darueber.
    try {
      await evaluateProactiveRiskAlertsIfDue();
    } catch (err) {
      logger.error("Proactive-Risk-Alert-Auswertung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 51 "Enterprise Decision Execution & Closed-Loop Operations" - im
    // selben bestehenden Tick, intern selbst auf 5min gedrosselt (siehe
    // core/automation-outcome-verification.ts), kein eigener Scheduler,
    // identisches Muster zu evaluateResilienceAlertsIfDue()/
    // evaluateProactiveRiskAlertsIfDue() oben.
    try {
      await evaluateAutomationOutcomesIfDue();
    } catch (err) {
      logger.error("Automation-Outcome-Verifikation fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 52 "Continuous Operational Assurance" - eigener, unabhaengig
    // gedrosselter Sweep im selben Tick (siehe
    // evaluateAutomationOutcomeDurabilityIfDue() in
    // core/automation-outcome-verification.ts), eigenes try/catch, identisches
    // Muster zu den beiden Bloecken oben - schliesst die "Regression nach
    // erfolgreicher Remediation"-Luecke, ohne die urspruengliche Phase-51-
    // Verifikation zu veraendern.
    try {
      await evaluateAutomationOutcomeDurabilityIfDue();
    } catch (err) {
      logger.error("Automation-Outcome-Durability-Auswertung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 55 "Enterprise Capacity & Resource Optimization" - eigener,
    // unabhaengig gedrosselter Sweep im selben Tick (siehe
    // evaluateAgentCapacityIfDue() in core/local-agent.ts), eigenes
    // try/catch, identisches Muster zu den Bloecken oben.
    try {
      await evaluateAgentCapacityIfDue();
    } catch (err) {
      logger.error("Agent-Kapazitaets-Auswertung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Phase 27 "Enterprise On-Call & Escalation Management" Auftragspunkt 5
    // "bestehende Scheduler-/Monitor-Infrastruktur wiederverwenden, keine
    // zweite Polling-Schleife" - im selben Tick wie SLO/API-Usage-
    // Intelligence, KEINE eigene Drosselung (anders als die beiden oben):
    // Eskalationsverzoegerungen sind minutengenau gemeint, ein 30s-Tick
    // ohne Zusatzdrosselung ist die richtige Praezision, die Abfrage selbst
    // ist ein einzelner indexierter SELECT (guenstig genug fuer jeden Tick).
    try {
      await evaluateIncidentEscalations();
    } catch (err) {
      logger.error("Incident-Eskalations-Auswertung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    for (const project of this.projects) {
      const maintenanceWindow = await getActiveMaintenanceWindow(project.id);
      await this.syncMaintenanceState(project, maintenanceWindow);

      for (const check of project.checks) {
        if (check.enabled) {
          // Phase 27 "Enterprise On-Call & Escalation Management" -
          // echter, live gefundener Bug (siehe Abschlussbericht "Gefundene
          // echte Bugs"): runCheck() war HIER an keiner Stelle in try/catch
          // eingefasst - ein einzelner fehlschlagender Check (z.B. ein
          // DB-Fehler, ein Bug in einem Checker) liess die unhandled
          // Rejection bis zum fire-and-forget "void this.monitor.
          // runAllChecks()" in core/scheduler.ts durchschlagen und damit den
          // GESAMTEN Node-Prozess abstuerzen (inkl. Login/API, seit Node 15
          // Standardverhalten bei einer unhandled promise rejection) - live
          // reproduziert waehrend dieser Phase. Jeder andere Tick-Schritt
          // (SLO/API-Usage-Intelligence/Eskalation, siehe oben) war bereits
          // korrekt isoliert; nur dieser Aufruf fehlte.
          try {
            await this.runCheck(project, check, maintenanceWindow);
          } catch (err) {
            logger.error("Check-Ausfuehrung fehlgeschlagen", {
              project: project.id,
              check: check.id,
              error: err instanceof Error ? err.message : "Unbekannter Fehler",
            });
          }
        }
      }

      // Nach allen Checks eines Projekts steht dessen Health-Zustand fuer
      // diesen Durchlauf fest - ein Event pro einzelnem Check waere hier zu
      // chattig und wuerde denselben Endzustand mehrfach senden.
      const projectHealth = await getProjectHealth(project.id);
      if (projectHealth) {
        broadcast(createEvent(RealtimeEventType.PROJECT_UPDATED, projectHealth));
        await evaluateProjectAlertRules(project.id, projectHealth.health.score);

        // Phase 11 Teil 1: PROJECT_CRITICAL/PROJECT_WARNING nur beim
        // tatsaechlichen Uebergang in diesen Status, analog zu
        // previousOverallStatus/HEALTH_CHANGED unten - kein Trigger bei
        // jedem Tick, waehrend der Status unveraendert bleibt.
        const previousProjectStatus = this.previousProjectStatusByProject.get(project.id);
        const currentProjectStatus = projectHealth.health.status;
        if (previousProjectStatus !== currentProjectStatus) {
          try {
            if (currentProjectStatus === HealthStatus.CRITICAL) {
              await evaluateAutomationTriggers("PROJECT_CRITICAL", project.id, { healthScore: projectHealth.health.score });
            } else if (currentProjectStatus === HealthStatus.WARNING) {
              await evaluateAutomationTriggers("PROJECT_WARNING", project.id, { healthScore: projectHealth.health.score });
            }
          } catch (err) {
            logger.error("Automatisierungs-Trigger PROJECT_CRITICAL/PROJECT_WARNING fehlgeschlagen", {
              projectId: project.id,
              error: err instanceof Error ? err.message : "Unbekannter Fehler",
            });
          }
        }
        this.previousProjectStatusByProject.set(project.id, currentProjectStatus);
      }
    }

    // Projektuebergreifende Korrelation (Auftragspunkt 7) - einmal je
    // vollstaendigem Durchlauf, nachdem alle Projekte ihre Incidents fuer
    // diesen Tick eroeffnet/geschlossen haben. Eigener try/catch, damit ein
    // Fehler hier nicht TIMELINE_UPDATED/HEALTH_CHANGED weiter unten verhindert.
    try {
      await correlateIncidents();
    } catch (err) {
      logger.error("Incident-Korrelation fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }

    // Jeder Durchlauf schreibt neue check_results-Zeilen - die Timeline hat
    // sich also immer geaendert, unabhaengig vom Ausgang einzelner Checks.
    broadcast(createEvent(RealtimeEventType.TIMELINE_UPDATED, { generatedAt: new Date().toISOString() }));

    // Production Audit (nach Phase 27/28) - echter, live gefundener Bug:
    // dies war der EINZIGE Schritt in diesem Tick ohne eigenes try/catch,
    // obwohl jeder Nachbarschritt oben genau dafuer eines hat ("Fehler in X
    // darf Y nicht verhindern"). Ein Fehler hier waere zwar durch den
    // globalen unhandledRejection-Handler in index.ts abgefangen worden
    // (kein Prozessabsturz), haette aber HEALTH_CHANGED fuer diesen Tick
    // stillschweigend ausfallen lassen - jetzt konsistent mit dem Rest der
    // Funktion isoliert.
    try {
      const summary = await getDashboardSummary();
      if (this.previousOverallStatus !== undefined && this.previousOverallStatus !== summary.status) {
        broadcast(
          createEvent(RealtimeEventType.HEALTH_CHANGED, {
            status: summary.status,
            previousStatus: this.previousOverallStatus,
          }),
        );
      }
      this.previousOverallStatus = summary.status;
    } catch (err) {
      logger.error("Dashboard-Summary/HEALTH_CHANGED-Auswertung fehlgeschlagen", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}

export const monitorService = new MonitorService();
