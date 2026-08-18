import { pool } from "../db/pool";
import { monitorService } from "../core/monitor";
import { getActiveMaintenanceWindow } from "../db/maintenance.repository";
import { buildDiagnosticSnapshotContent } from "../incidents/diagnostic-snapshot";
import { createDiagnosticSnapshot } from "../db/diagnostic-snapshots.repository";
import { clearDashboardCache } from "../db/dashboard.repository";
import { syncProjects } from "../db/projects.repository";
import { listPendingNotificationEvents } from "../db/notification-events.repository";
import { dispatchNotificationEvent } from "../notifications/notification-event.service";
import { createAutomationBackup } from "../db/automation-backups.repository";
import { listAlertRules } from "../db/alerts.repository";
import { listMaintenanceWindows } from "../db/maintenance.repository";
import {
  isDockerSocketAvailable,
  resolveWhitelistedContainerName,
  restartContainerViaDockerSocket,
} from "./docker-client";
import type { AutomationAction, AutomationActionType, AutomationLogLevel } from "../types/automation.types";
import type { NotificationEventSeverity, NotificationEventType } from "../notifications/notification-event.types";

export type ActionLogger = (level: AutomationLogLevel, message: string) => Promise<void>;

// Phase 11 Teil 2 "Self Healing": diese zehn Aktionen haben eine echte
// Implementierung unten (executeSafeAction). RESTART_SERVICE bleibt ohne
// Ausfuehrungspfad - ProjectOps hat fuer die extern ueberwachten Projekte
// (rechno, driveconnect, ...) keinerlei Infrastrukturzugriff, um einen
// "Service" dort neu zu starten; ein Vortaeuschen waere Fake-Verhalten.
export const EXECUTABLE_AUTOMATION_ACTIONS: readonly AutomationActionType[] = [
  "RUN_HEALTH_CHECK",
  "CREATE_DIAGNOSTIC_SNAPSHOT",
  "COLLECT_LOGS",
  "CLEAR_CACHE",
  "RESTART_MONITOR",
  "RETRY_CHECK",
  "RELOAD_CONFIGURATION",
  "FLUSH_QUEUE",
  "CREATE_BACKUP",
  "VERIFY_DEPENDENCIES",
  "RESTART_CONTAINER",
];

// Teilmenge von EXECUTABLE_AUTOMATION_ACTIONS, die zusaetzlich unbeaufsichtigt
// (automation_rules.auto_execute = true, ohne menschliche Freigabe) laufen
// darf - siehe DB-Constraint automation_rules_auto_execute_safe_only
// (Migration 0030). RESTART_CONTAINER ist trotz echter Implementierung
// bewusst ausgenommen: ein Container-Neustart ist disruptiver als die
// uebrigen, rein datenbasierten Aktionen und soll immer eine bewusste
// menschliche Entscheidung bleiben.
export const AUTO_EXECUTABLE_ACTIONS: readonly AutomationActionType[] = EXECUTABLE_AUTOMATION_ACTIONS.filter(
  (action) => action !== "RESTART_CONTAINER",
);

export function hasAutomationExecutor(action: AutomationActionType): boolean {
  return EXECUTABLE_AUTOMATION_ACTIONS.includes(action);
}

export function isAutoExecutable(action: AutomationActionType): boolean {
  return AUTO_EXECUTABLE_ACTIONS.includes(action);
}

// Rueckwaertskompatibler Alias - Phase 10 nannte dies "safe" (siehe
// routes/automation-rules.routes.ts SAFE_ACTIONS-Set, dort weiterhin
// verwendet fuer dieselbe Bedeutung "auto_execute erlaubt").
export const isSafeAutomationAction = isAutoExecutable;
export const SAFE_AUTOMATION_ACTIONS = AUTO_EXECUTABLE_ACTIONS;

async function runHealthCheck(projectId: string, log: ActionLogger): Promise<Record<string, unknown>> {
  const project = monitorService.getProject(projectId);
  if (!project) {
    throw new Error(`Projekt "${projectId}" nicht gefunden`);
  }

  const maintenanceWindow = await getActiveMaintenanceWindow(projectId);
  const results = [];
  for (const check of project.checks) {
    if (!check.enabled) continue;
    const result = await monitorService.runCheck(project, check, maintenanceWindow);
    await log(result.status === "ONLINE" ? "INFO" : "WARN", `Check "${check.id}" -> ${result.status}`);
    results.push({ checkId: result.checkId, status: result.status, responseTimeMs: result.responseTimeMs ?? null });
  }

  return { checksRun: results.length, results };
}

async function createSnapshot(action: AutomationAction, log: ActionLogger): Promise<Record<string, unknown>> {
  const content = await buildDiagnosticSnapshotContent(action.projectId);
  await log("INFO", `Health-Score zum Zeitpunkt des Snapshots: ${content.healthScore}`);
  const snapshot = await createDiagnosticSnapshot({
    projectId: action.projectId,
    ...(action.incidentId !== null ? { incidentId: action.incidentId } : {}),
    healthScore: content.healthScore,
    snapshot: content,
  });
  return { snapshotId: snapshot.id, healthScore: snapshot.healthScore };
}

interface RecentCheckResultRow {
  check_id: string;
  status: string;
  error: string | null;
  checked_at: string | Date;
}

interface RecentIncidentRow {
  id: number;
  title: string;
  severity: string;
  resolved: boolean;
  created_at: string | Date;
}

const RECENT_LOGS_LIMIT = 50;

// "Collect Logs" bedeutet hier: die juengsten echten Check-Ergebnisse und
// Incidents des Projekts aus der DB buendeln (kein Zugriff auf Dateisystem-
// Logs des Hosts - dieses Projekt hat keine solche Log-Quelle).
async function collectLogs(projectId: string, log: ActionLogger): Promise<Record<string, unknown>> {
  const [checkResults, incidents] = await Promise.all([
    pool.query<RecentCheckResultRow>(
      `SELECT cr.check_id, cr.status, cr.error, cr.checked_at
       FROM check_results cr JOIN checks c ON c.id = cr.check_id
       WHERE c.project_id = $1
       ORDER BY cr.checked_at DESC LIMIT $2`,
      [projectId, RECENT_LOGS_LIMIT],
    ),
    pool.query<RecentIncidentRow>(
      `SELECT id, title, severity, resolved, created_at FROM incidents
       WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [projectId, RECENT_LOGS_LIMIT],
    ),
  ]);

  await log("INFO", `${checkResults.rows.length} Check-Ergebnisse, ${incidents.rows.length} Incidents gesammelt`);

  return {
    checkResults: checkResults.rows.map((row) => ({
      checkId: row.check_id,
      status: row.status,
      error: row.error,
      checkedAt: row.checked_at instanceof Date ? row.checked_at.toISOString() : row.checked_at,
    })),
    incidents: incidents.rows.map((row) => ({
      id: row.id,
      title: row.title,
      severity: row.severity,
      resolved: row.resolved,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    })),
  };
}

async function clearCache(log: ActionLogger): Promise<Record<string, unknown>> {
  clearDashboardCache();
  await log("INFO", "Dashboard-Zusammenfassungs-Cache geleert - naechster Abruf berechnet neu");
  return { cacheCleared: "dashboard-summary" };
}

// "Monitor neu starten" heisst hier: den internen Wartungsfenster-Zustand
// des Schedulers fuer dieses Projekt verwerfen (naechster Tick erkennt den
// aktuellen Zustand komplett neu, statt auf dem zuletzt gesehenen
// aufzusetzen) und sofort einen frischen Check-Durchlauf ausloesen -
// ProjectOps hat keinen eigenen Prozess/Container fuer "den Monitor eines
// Projekts", den es sonst neu starten koennte.
async function restartMonitor(projectId: string, log: ActionLogger): Promise<Record<string, unknown>> {
  monitorService.resetProjectState(projectId);
  await log("INFO", "Interner Scheduler-Zustand fuer dieses Projekt zurueckgesetzt");
  const result = await runHealthCheck(projectId, log);
  return { monitorReset: true, ...result };
}

async function retryCheck(action: AutomationAction, log: ActionLogger): Promise<Record<string, unknown>> {
  const checkId = action.context?.checkId;
  if (!checkId) {
    throw new Error("RETRY_CHECK benoetigt einen checkId im Ausloese-Kontext");
  }
  const project = monitorService.getProject(action.projectId);
  if (!project) {
    throw new Error(`Projekt "${action.projectId}" nicht gefunden`);
  }
  const check = project.checks.find((c) => c.id === checkId);
  if (!check) {
    throw new Error(`Check "${checkId}" nicht in Projekt "${action.projectId}" gefunden`);
  }

  const maintenanceWindow = await getActiveMaintenanceWindow(action.projectId);
  const result = await monitorService.runCheck(project, check, maintenanceWindow);
  await log(result.status === "ONLINE" ? "INFO" : "WARN", `Check "${checkId}" erneut geprueft -> ${result.status}`);
  return { checkId, status: result.status, responseTimeMs: result.responseTimeMs ?? null };
}

// Synchronisiert die projects-Tabelle erneut mit der statisch geladenen
// config/projects.config.ts - echtes Nachziehen von Konfigurationsaenderungen
// ohne vollen Prozess-Neustart, kein Fake-"Config-Reload" (ein vollstaendiges
// Hot-Reload von TypeScript-Code zur Laufzeit ist ohne Prozess-Neustart
// nicht moeglich - das waere die einzige unehrliche Alternative gewesen).
async function reloadConfiguration(log: ActionLogger): Promise<Record<string, unknown>> {
  const projects = monitorService.getProjects();
  await syncProjects(projects);
  await log("INFO", `${projects.length} Projekte aus der statischen Konfiguration synchronisiert`);
  return { projectsSynced: projects.length };
}

// Die einzige echte "Warteschlange" in ProjectOps: PUSH-Benachrichtigungen
// bleiben PENDING, solange kein APNs-Anbieter angebunden ist (siehe
// event-channels/push-event.channel.ts). FLUSH_QUEUE versucht die erneute
// Zustellung ueber genau denselben Dispatch-Pfad wie beim ersten Versuch.
async function flushQueue(projectId: string, log: ActionLogger): Promise<Record<string, unknown>> {
  const pending = await listPendingNotificationEvents(projectId);
  await log("INFO", `${pending.length} ausstehende Benachrichtigungen gefunden`);

  for (const item of pending) {
    await dispatchNotificationEvent({
      type: item.eventType as NotificationEventType,
      projectId: item.projectId,
      projectName: item.projectId,
      severity: item.severity as NotificationEventSeverity,
      title: item.title,
      message: item.message,
      timestamp: new Date().toISOString(),
      ...(item.metadata ? { metadata: item.metadata } : {}),
    });
  }

  await log("INFO", `${pending.length} Zustellversuche erneut angestossen`);
  return { flushed: pending.length };
}

// Echter, datenbankgestuetzter Snapshot der Automatisierungs-/Monitoring-
// Konfiguration eines Projekts (Alert-Regeln, Wartungsfenster) - kein
// pg_dump-Aufruf: der Node-22-alpine-Laufzeit-Container enthaelt keinen
// Postgres-Client, ein vorgetaeuschter Aufruf eines nicht vorhandenen
// Binaries waere im Ernstfall stillschweigend kaputt.
async function createBackup(action: AutomationAction, log: ActionLogger): Promise<Record<string, unknown>> {
  const [alertRules, maintenanceWindows] = await Promise.all([
    listAlertRules({ projectId: action.projectId }),
    listMaintenanceWindows({ projectId: action.projectId }),
  ]);

  const backup = await createAutomationBackup({
    projectId: action.projectId,
    data: {
      capturedAt: new Date().toISOString(),
      alertRules,
      maintenanceWindows,
    },
  });

  await log("INFO", `Backup #${backup.id} mit ${alertRules.length} Alert-Regeln und ${maintenanceWindows.length} Wartungsfenstern erstellt`);
  return { backupId: backup.id };
}

// "Abhaengigkeiten" = die konfigurierten Checks eines Projekts (Firebase,
// Stripe, HTTP-API, ...) - VERIFY_DEPENDENCIES fuehrt sie real aus und
// meldet strukturiert, welche Abhaengigkeit gerade erreichbar ist.
async function verifyDependencies(projectId: string, log: ActionLogger): Promise<Record<string, unknown>> {
  const result = await runHealthCheck(projectId, log);
  const results = (result.results as Array<{ checkId: string; status: string }>) ?? [];
  const healthy = results.filter((r) => r.status === "ONLINE").length;
  await log("INFO", `${healthy}/${results.length} Abhaengigkeiten erreichbar`);
  return { dependenciesChecked: results.length, healthy, unhealthy: results.length - healthy, details: results };
}

// Echter Docker-Engine-API-Aufruf ueber den Unix-Socket (kein Shell-Aufruf,
// siehe docker-client.ts) - nur fuer den ueber DOCKER_SELF_CONTAINER_NAME
// fest konfigurierten Container, niemals einen aus dem Request. Ohne
// gemounteten Docker-Socket (Standardfall - docker-compose.production.yml
// mountet ihn bewusst NICHT, siehe README) schlaegt die Aktion mit einer
// klaren Fehlermeldung fehl, statt Erfolg vorzutaeuschen.
async function restartContainer(log: ActionLogger): Promise<Record<string, unknown>> {
  const containerName = resolveWhitelistedContainerName();
  if (!containerName) {
    throw new Error("DOCKER_SELF_CONTAINER_NAME ist nicht konfiguriert - kein Zielcontainer bekannt");
  }
  if (!isDockerSocketAvailable()) {
    throw new Error("Docker-Socket (/var/run/docker.sock) ist in diesem Container nicht verfuegbar/gemountet");
  }

  await log("INFO", `Sende Neustart-Befehl an Container "${containerName}" ueber die Docker Engine API`);
  await restartContainerViaDockerSocket(containerName);
  await log("INFO", "Docker Engine API hat den Neustart bestaetigt");
  return { containerName, restarted: true };
}

// Wirft bei Fehlern (statt sie zu verschlucken) - der Aufrufer
// (automation/execution-runner.ts) faengt den Fehler und persistiert ihn
// als FAILED-Ausfuehrung inkl. Log-Zeile.
export async function executeSafeAction(action: AutomationAction, log: ActionLogger): Promise<Record<string, unknown>> {
  switch (action.action) {
    case "RUN_HEALTH_CHECK":
      return runHealthCheck(action.projectId, log);
    case "CREATE_DIAGNOSTIC_SNAPSHOT":
      return createSnapshot(action, log);
    case "COLLECT_LOGS":
      return collectLogs(action.projectId, log);
    case "CLEAR_CACHE":
      return clearCache(log);
    case "RESTART_MONITOR":
      return restartMonitor(action.projectId, log);
    case "RETRY_CHECK":
      return retryCheck(action, log);
    case "RELOAD_CONFIGURATION":
      return reloadConfiguration(log);
    case "FLUSH_QUEUE":
      return flushQueue(action.projectId, log);
    case "CREATE_BACKUP":
      return createBackup(action, log);
    case "VERIFY_DEPENDENCIES":
      return verifyDependencies(action.projectId, log);
    case "RESTART_CONTAINER":
      return restartContainer(log);
    default:
      throw new Error(`Aktion "${action.action}" darf nicht automatisch ausgefuehrt werden`);
  }
}
