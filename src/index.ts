import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { corsOptions } from "./config/cors.config";
import { healthRouter } from "./routes/health.routes";
import { projectsRouter } from "./routes/projects.routes";
import { resultsRouter } from "./routes/results.routes";
import { notificationsRouter } from "./routes/notifications.routes";
import { incidentsRouter } from "./routes/incidents.routes";
import { deploymentsRouter } from "./routes/deployments.routes";
import { checksRouter } from "./routes/checks.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { usersRouter } from "./routes/users.routes";
import { alertsRouter } from "./routes/alerts.routes";
import { notificationSettingsRouter } from "./routes/notification-settings.routes";
import { analyticsRouter } from "./routes/analytics.routes";
import { alertEventsRouter } from "./routes/alert-events.routes";
import { maintenanceRouter } from "./routes/maintenance.routes";
import { changesRouter } from "./routes/changes.routes";
import { reliabilityRouter } from "./routes/reliability.routes";
import { problemsRouter } from "./routes/problems.routes";
import { resilienceRouter } from "./routes/resilience.routes";
import { rootIncidentsRouter } from "./routes/root-incidents.routes";
import { automationActionsRouter } from "./routes/automation-actions.routes";
import { automationRulesRouter } from "./routes/automation-rules.routes";
import { automationExecutionsRouter } from "./routes/automation-executions.routes";
import { automationTemplatesRouter } from "./routes/automation-templates.routes";
import { automationAnalyticsRouter } from "./routes/automation-analytics.routes";
import { diagnosticSnapshotsRouter } from "./routes/diagnostic-snapshots.routes";
import { notificationEventsRouter } from "./routes/notification-events.routes";
import { authRouter } from "./routes/auth.routes";
import { monitoringAgentsRouter } from "./routes/monitoring-agents.routes";
import { statusPageRouter } from "./routes/status-page.routes";
import { auditRouter } from "./routes/audit.routes";
import { backupsRouter } from "./routes/backups.routes";
import { diagnosticsRouter } from "./routes/diagnostics.routes";
import { disasterRecoveryRouter } from "./routes/disaster-recovery.routes";
import { forecastRouter } from "./routes/forecast.routes";
import { slaReportRouter } from "./routes/sla-report.routes";
import { regionAnalyticsRouter } from "./routes/region-analytics.routes";
import { clusterRouter } from "./routes/cluster.routes";
import { clusterAgentsRouter } from "./routes/cluster-agents.routes";
import { organizationsRouter } from "./routes/organizations.routes";
import { teamsRouter } from "./routes/teams.routes";
import { apiKeysRouter } from "./routes/api-keys.routes";
import { serviceAccountsRouter } from "./routes/service-accounts.routes";
import { webhooksRouter } from "./routes/webhooks.routes";
import { platformRouter } from "./routes/platform.routes";
import { platformSloRouter } from "./routes/platform-slo.routes";
import { platformServicesRouter } from "./routes/platform-services.routes";
import { onCallRouter } from "./routes/on-call.routes";
import { escalationPoliciesRouter } from "./routes/escalation-policies.routes";
import { todosRouter } from "./routes/todos.routes";
import { acquisitionRouter } from "./routes/acquisition.routes";
import { v1Router } from "./routes/v1";
import { requestContextMiddleware } from "./middleware/request-context.middleware";
import { errorHandler } from "./middleware/error-handler";
import { logger } from "./core/logger";
import { monitorService } from "./core/monitor";
import { Scheduler } from "./core/scheduler";
import { pool } from "./db/pool";
import { syncProjects } from "./db/projects.repository";
import { closeRealtimeServer, initRealtimeServer } from "./realtime/websocket.server";
import { startTodoDigest, stopTodoDigest } from "./core/todo-digest";
import { getLocalAgentId, markLocalAgentOffline } from "./core/local-agent";
import { getMonitoringAgentById } from "./db/monitoring-agents.repository";

const app = express();
const port = process.env.PORT ?? 4000;
const checkIntervalMs = Number(process.env.CHECK_INTERVAL_MS) || 30_000;

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(requestContextMiddleware);
app.use(healthRouter);
app.use("/api", authRouter);
app.use("/api", projectsRouter);
app.use("/api", resultsRouter);
app.use("/api", notificationsRouter);
app.use("/api", incidentsRouter);
app.use("/api", deploymentsRouter);
app.use("/api", checksRouter);
app.use("/api", dashboardRouter);
app.use("/api", usersRouter);
app.use("/api", alertsRouter);
app.use("/api", notificationSettingsRouter);
app.use("/api", analyticsRouter);
app.use("/api", alertEventsRouter);
app.use("/api", maintenanceRouter);
app.use("/api", changesRouter);
app.use("/api", rootIncidentsRouter);
app.use("/api", automationActionsRouter);
app.use("/api", automationRulesRouter);
app.use("/api", automationExecutionsRouter);
app.use("/api", automationTemplatesRouter);
app.use("/api", automationAnalyticsRouter);
app.use("/api", diagnosticSnapshotsRouter);
app.use("/api", notificationEventsRouter);
app.use("/api", monitoringAgentsRouter);
// Bewusst OHNE "/api"-Praefix-Authentifizierung wie alle anderen Router
// oben - statusPageRouter deklariert selbst keine authenticate-Middleware
// auf seinen Routen und ist damit der einzige oeffentlich (ohne Login)
// erreichbare API-Bereich (Phase 13 Teil 3 "Public Status Page").
app.use("/api", statusPageRouter);
app.use("/api", auditRouter);
app.use("/api", backupsRouter);
app.use("/api", diagnosticsRouter);
app.use("/api", disasterRecoveryRouter);
app.use("/api", forecastRouter);
app.use("/api", slaReportRouter);
app.use("/api", regionAnalyticsRouter);
app.use("/api", clusterAgentsRouter);
app.use("/api", clusterRouter);
app.use("/api", organizationsRouter);
app.use("/api", teamsRouter);
app.use("/api", apiKeysRouter);
app.use("/api", serviceAccountsRouter);
app.use("/api", webhooksRouter);
app.use("/api", platformRouter);
app.use("/api", platformSloRouter);
app.use("/api", platformServicesRouter);
app.use("/api", onCallRouter);
app.use("/api", escalationPoliciesRouter);
app.use("/api", todosRouter);
app.use("/api", acquisitionRouter);
app.use("/api", reliabilityRouter);
app.use("/api", problemsRouter);
app.use("/api", resilienceRouter);
// Phase 16 "Enterprise API Platform" - API-Key-authentifiziert (siehe
// middleware/api-key-auth.ts), bewusst nach allen Browser-Session-Routen
// gemountet und OHNE das globale authenticate()-Cookie-Erfordernis (jeder
// v1-Router deklariert seine eigene authenticateApiKey-Middleware selbst).
app.use("/api", v1Router);
app.use(errorHandler);

// Phase 27 "Enterprise On-Call & Escalation Management" - Verteidigung in
// der Tiefe zusaetzlich zum eigentlichen Fix in core/monitor.ts (siehe
// dortiger Kommentar "Gefundene echte Bugs"): eine unhandled promise
// rejection irgendwo im Prozess (z.B. ein zukuenftig vergessenes try/catch
// um einen weiteren fire-and-forget-Aufruf) beendet in Node.js seit Version
// 15 standardmaessig den GESAMTEN Prozess - inklusive Login/API. Nur
// LOGGEN statt den Prozess zu beenden ist hier die richtige Wahl fuer einen
// Monitoring-/API-Server, der durchgehend erreichbar bleiben MUSS, selbst
// wenn eine einzelne Hintergrundaufgabe fehlschlaegt.
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection - Prozess laeuft weiter", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception - Prozess laeuft weiter", { error: err.message, stack: err.stack });
});

async function main(): Promise<void> {
  await syncProjects(monitorService.getProjects());

  const server = app.listen(port, () => {
    logger.info(`ProjectOps Backend gestartet`, { port });
  });

  initRealtimeServer(server);

  const scheduler = new Scheduler(monitorService, checkIntervalMs);
  scheduler.start();
  startTodoDigest();

  const shutdown = async (): Promise<void> => {
    logger.info("ProjectOps Backend wird beendet");
    scheduler.stop();
    stopTodoDigest();
    // Echtes AGENT_OFFLINE-Signal statt nur auf den Heartbeat-Timeout zu
    // warten (Phase 13 Teil 1) - Broadcast VOR closeRealtimeServer(), sonst
    // erreicht das Event keinen Client mehr.
    try {
      const localAgent = await getMonitoringAgentById(getLocalAgentId());
      if (localAgent) {
        markLocalAgentOffline(localAgent);
      }
    } catch (err) {
      logger.error("AGENT_OFFLINE konnte nicht gemeldet werden", {
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
    closeRealtimeServer();
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Start fehlgeschlagen", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
