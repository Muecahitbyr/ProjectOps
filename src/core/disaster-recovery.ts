import { pool } from "../db/pool";
import { listMonitoringAgents } from "../db/monitoring-agents.repository";
import type { DisasterRecoveryReport, DisasterRecoverySignal, DisasterRecoveryStatus } from "../types/diagnostics.types";

// Phase 13 Teil 9 "Disaster Recovery" - jedes Signal prueft einen echten,
// aktuellen Systemzustand (DB-Verbindung, Agent-Heartbeats, Scheduler-
// Aktivitaet, haengende Automatisierungs-Ausfuehrungen, Benachrichtigungs-
// Warteschlange) - kein Signal wird vorgetaeuscht.
const SCHEDULER_STALE_AFTER_MS = 5 * 60 * 1000;
const AUTOMATION_HANG_AFTER_MINUTES = 10;
const NOTIFICATION_QUEUE_STALE_AFTER_HOURS = 1;

async function checkDatabase(): Promise<DisasterRecoverySignal> {
  try {
    await pool.query("SELECT 1");
    return { name: "Database", healthy: true, detail: "PostgreSQL erreichbar" };
  } catch (err) {
    return { name: "Database", healthy: false, detail: err instanceof Error ? err.message : "Nicht erreichbar" };
  }
}

async function checkAgents(): Promise<DisasterRecoverySignal> {
  const agents = await listMonitoringAgents();
  const offline = agents.filter((agent) => agent.status === "OFFLINE");
  if (agents.length === 0) {
    return { name: "Monitoring Agents", healthy: false, detail: "Kein Agent registriert" };
  }
  if (offline.length > 0) {
    return {
      name: "Monitoring Agents",
      healthy: false,
      detail: `${offline.length} von ${agents.length} Agent(en) offline: ${offline.map((a) => a.name).join(", ")}`,
    };
  }
  return { name: "Monitoring Agents", healthy: true, detail: `${agents.length} Agent(en) online` };
}

// Redis ist "Vorbereitung" (Auftrag) - es gibt aktuell keine Redis-Anbindung
// in dieser Architektur. Ehrlich als "nicht konfiguriert" gemeldet statt
// einen erfundenen Verbindungsstatus vorzutaeuschen.
function checkRedis(): DisasterRecoverySignal {
  const configured = Boolean(process.env.REDIS_URL);
  return {
    name: "Redis",
    healthy: true,
    detail: configured ? "Konfiguriert (Verbindungspruefung noch nicht implementiert)" : "Nicht konfiguriert (Vorbereitung, kein Redis in dieser Architektur)",
  };
}

async function checkNotificationQueue(): Promise<DisasterRecoverySignal> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM notification_events
     WHERE status = 'PENDING' AND created_at < now() - ($1 || ' hours')::interval`,
    [NOTIFICATION_QUEUE_STALE_AFTER_HOURS],
  );
  const staleCount = Number(rows[0]?.count ?? 0);
  return {
    name: "Notification Queue",
    healthy: staleCount === 0,
    detail: staleCount === 0
      ? "Keine ueberfaelligen Benachrichtigungen"
      : `${staleCount} Benachrichtigung(en) seit ueber ${NOTIFICATION_QUEUE_STALE_AFTER_HOURS}h unzugestellt`,
  };
}

async function checkScheduler(): Promise<DisasterRecoverySignal> {
  const { rows } = await pool.query<{ latest: string | Date | null }>(`SELECT MAX(checked_at) AS latest FROM check_results`);
  const latest = rows[0]?.latest;
  if (!latest) {
    return { name: "Scheduler", healthy: false, detail: "Noch keine Check-Ergebnisse vorhanden" };
  }
  const ageMs = Date.now() - new Date(latest).getTime();
  return {
    name: "Scheduler",
    healthy: ageMs <= SCHEDULER_STALE_AFTER_MS,
    detail: ageMs <= SCHEDULER_STALE_AFTER_MS
      ? "Laeuft (letzter Check vor Kurzem)"
      : `Letzter Check vor ${Math.round(ageMs / 60_000)} Minuten - moeglicherweise ausgefallen`,
  };
}

async function checkAutomationEngine(): Promise<DisasterRecoverySignal> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM automation_executions
     WHERE status = 'RUNNING' AND started_at < now() - ($1 || ' minutes')::interval`,
    [AUTOMATION_HANG_AFTER_MINUTES],
  );
  const hungCount = Number(rows[0]?.count ?? 0);
  return {
    name: "Automation Engine",
    healthy: hungCount === 0,
    detail: hungCount === 0
      ? "Keine haengenden Ausfuehrungen"
      : `${hungCount} Ausfuehrung(en) seit ueber ${AUTOMATION_HANG_AFTER_MINUTES} Minuten in RUNNING`,
  };
}

export async function getDisasterRecoveryReport(): Promise<DisasterRecoveryReport> {
  const signals = await Promise.all([
    checkDatabase(),
    checkAgents(),
    Promise.resolve(checkRedis()),
    checkNotificationQueue(),
    checkScheduler(),
    checkAutomationEngine(),
  ]);

  const unhealthyCount = signals.filter((signal) => !signal.healthy).length;
  const status: DisasterRecoveryStatus = unhealthyCount === 0 ? "HEALTHY" : unhealthyCount === 1 ? "DEGRADED" : "CRITICAL";
  // Ein nicht erreichbares DB gilt immer als CRITICAL, unabhaengig von der
  // Zaehlung sonstiger Signale - ohne DB ist praktisch das gesamte System
  // betroffen.
  const dbSignal = signals[0]!;
  const finalStatus: DisasterRecoveryStatus = !dbSignal.healthy ? "CRITICAL" : status;

  return { status: finalStatus, generatedAt: new Date().toISOString(), signals };
}
