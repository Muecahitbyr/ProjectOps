import { readFileSync } from "node:fs";
import { statfsSync, existsSync } from "node:fs";
import { cpus, hostname, loadavg, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { upsertAgentHeartbeat, listMonitoringAgents } from "../db/monitoring-agents.repository";
import { recordSystemMetric } from "../db/system-metrics.repository";
import { getDiskGrowthForecast, getCapacityForecast } from "../db/forecast.repository";
import { createAuditLogEntry, listAuditLog } from "../db/audit-log.repository";
import { listRegisteredCheckTypes } from "../checks/check-registry";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { dispatchWebhookEvent } from "./webhook-dispatch";
import { buildForecastSummary } from "./service-resilience";
import { logger } from "./logger";
import {
  AGENT_CAPACITY_SWEEP_INTERVAL_MS,
  AGENT_CAPACITY_WARNING_THRESHOLD_PERCENT,
  AGENT_CAPACITY_CLEAR_THRESHOLD_PERCENT,
} from "../config/agent-capacity.config";
import type { MonitoringAgent } from "../types/monitoring-agent.types";
import type { ForecastMetric } from "../types/forecast.types";

// Phase 13 Teil 1 "Monitoring Agents". Dieser Prozess (der einzige, der in
// ProjectOps tatsaechlich Checks ausfuehrt) meldet sich hier mit ECHTEN
// Host-Daten als genau ein realer Agent an - keine erfundenen "weiteren"
// Agenten. Weitere, echte Remote-Agenten koennten sich ueber denselben
// upsertAgentHeartbeat()-Pfad melden (siehe routes/monitoring-agents.routes.ts),
// werden hier aber nicht vorgetaeuscht.
function resolveAgentId(): string {
  return process.env.AGENT_ID?.trim() || `local-${hostname()}`;
}

function resolveBackendVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "version" in parsed && typeof parsed.version === "string") {
      return parsed.version;
    }
  } catch {
    // Kein package.json lesbar (z.B. abweichendes Arbeitsverzeichnis) - "unknown"
    // statt einer erfundenen Versionsnummer.
  }
  return "unknown";
}

interface DiskUsage {
  totalMb: number;
  usedMb: number;
}

function resolveDiskUsage(): DiskUsage | null {
  try {
    const stats = statfsSync(process.cwd());
    const totalMb = Math.round((stats.blocks * stats.bsize) / 1024 / 1024);
    const usedMb = Math.round(((stats.blocks - stats.bfree) * stats.bsize) / 1024 / 1024);
    return { totalMb, usedMb };
  } catch {
    // statfsSync ist nicht auf jeder Plattform verfuegbar (z.B. Windows vor
    // Node 22) - "nicht verfuegbar" statt eines erfundenen Werts.
    return null;
  }
}

function isDockerized(): boolean {
  return existsSync("/.dockerenv");
}

let cachedAgentId: string | undefined;
let lastKnownStatus: "ONLINE" | "OFFLINE" | undefined;

export function getLocalAgentId(): string {
  cachedAgentId ??= resolveAgentId();
  return cachedAgentId;
}

// Wird bei jedem Scheduler-Tick aufgerufen (core/monitor.ts) - nutzt damit
// dieselbe bestehende Taktung statt eines eigenen zusaetzlichen Timers.
export async function heartbeatLocalAgent(): Promise<MonitoringAgent> {
  const id = getLocalAgentId();
  const backendVersion = resolveBackendVersion();
  const wasKnownOnline = lastKnownStatus === "ONLINE";
  const disk = resolveDiskUsage();

  const agent = await upsertAgentHeartbeat({
    id,
    name: process.env.AGENT_NAME?.trim() || hostname(),
    region: process.env.AGENT_REGION?.trim() || null,
    hostname: hostname(),
    agentVersion: backendVersion,
    schedulerVersion: backendVersion,
    capabilities: listRegisteredCheckTypes(),
    cpuInfo: cpus()[0] ? `${cpus()[0]!.model} (${cpus().length} cores)` : null,
    ramMb: Math.round(totalmem() / 1024 / 1024),
    diskTotalMb: disk?.totalMb ?? null,
    os: `${platform()} ${release()}`,
    dockerVersion: isDockerized() ? (process.env.DOCKER_VERSION?.trim() ?? "containerized (version unknown)") : null,
  });

  if (!wasKnownOnline) {
    broadcast(createEvent(RealtimeEventType.AGENT_ONLINE, agent));
    void dispatchWebhookEvent("AGENT_ONLINE", agent);
  }
  broadcast(createEvent(RealtimeEventType.AGENT_HEARTBEAT, agent));
  lastKnownStatus = "ONLINE";

  try {
    const memUsage = process.memoryUsage();
    // loadavg() liefert auf Windows immer [0,0,0] (keine Fake-Daten - echtes
    // Verhalten der Node-API auf dieser Plattform, nicht von uns erfunden).
    const load1Min = loadavg()[0] ?? 0;
    const cpuLoadPercent = cpus().length > 0 ? Math.min(100, Math.round((load1Min / cpus().length) * 100)) : null;

    await recordSystemMetric({
      agentId: id,
      cpuLoadPercent,
      memoryUsedMb: Math.round(memUsage.rss / 1024 / 1024),
      memoryTotalMb: Math.round(totalmem() / 1024 / 1024),
      diskUsedMb: disk?.usedMb ?? null,
      diskTotalMb: disk?.totalMb ?? null,
    });
    // Teil 10 "Disk Growth"/"Capacity Forecast" basieren genau auf dieser
    // system_metrics-Zeitreihe - die Grundlage hat sich hier tatsaechlich
    // veraendert, daher genau hier (nicht bei jedem GET /forecasts/*)
    // gebroadcastet.
    const generatedAt = new Date().toISOString();
    broadcast(createEvent(RealtimeEventType.FORECAST_UPDATED, { metric: "DISK_USAGE", generatedAt }));
    broadcast(createEvent(RealtimeEventType.FORECAST_UPDATED, { metric: "CAPACITY", generatedAt }));
    void dispatchWebhookEvent("FORECAST_UPDATED", { metric: "DISK_USAGE", generatedAt });
  } catch (err) {
    logger.error("System-Metrik konnte nicht gespeichert werden", {
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
  }

  return agent;
}

// Wird beim geordneten Shutdown aufgerufen (index.ts) - ein echtes
// AGENT_OFFLINE-Signal statt nur auf den Heartbeat-Timeout zu warten.
export function markLocalAgentOffline(agent: MonitoringAgent): void {
  lastKnownStatus = "OFFLINE";
  const offlineAgent: MonitoringAgent = { ...agent, status: "OFFLINE" };
  broadcast(createEvent(RealtimeEventType.AGENT_OFFLINE, offlineAgent));
  void dispatchWebhookEvent("AGENT_OFFLINE", offlineAgent);
}

// Phase 55 "Enterprise Capacity & Resource Optimization" - Bestandsanalyse-
// Ergebnis: db/forecast.repository.ts#getDiskGrowthForecast()/
// getCapacityForecast() (Phase 13) liefern bereits echte, statistische
// Trend-Prognosen ueber die von diesem Modul gesammelten system_metrics -
// bislang jedoch NUR ueber den rohen GET /forecasts/*-Anzeige-Endpunkt
// erreichbar, NIE gegen eine Kapazitaetsgrenze bewertet. Anders als
// AGENT_OFFLINE (reaktiv, Heartbeat fehlt bereits) fehlt hier das
// PROSPEKTIVE Gegenstueck: "wird dieser Agent in absehbarer Zeit die
// eigene Kapazitaet erreichen" - fuer die aktuelle Ein-Agent-Realitaet
// dieser Instanz (siehe Dateikopf-Kommentar) ein echtes systemisches
// Risiko, da JEDES Projekt transitiv von der Verfuegbarkeit dieses einen
// Agenten abhaengt. Wiederverwendet dieselbe Trend-Ableitung wie
// core/service-resilience.ts (Phase 42/46, jetzt exportiert), dieselbe
// Hysterese-Technik wie core/proactive-risk-alerting.ts (Phase 49), und
// denselben Audit-/Webhook-Versand wie AGENT_OFFLINE oben - kein neues
// Engine, nur eine bisher fehlende Verbindung zwischen bereits bestehenden
// Bausteinen.
export const AGENT_CAPACITY_WARNING_ACTION = "AGENT_CAPACITY_WARNING";
export const AGENT_CAPACITY_RECOVERED_ACTION = "AGENT_CAPACITY_RECOVERED";

interface CapacityMetricSpec {
  metric: Extract<ForecastMetric, "DISK_USAGE" | "CAPACITY">;
  label: string;
  totalMbOf: (agent: MonitoringAgent) => number | null;
  forecast: (agentId: string) => ReturnType<typeof getDiskGrowthForecast>;
}

const CAPACITY_METRICS: CapacityMetricSpec[] = [
  { metric: "DISK_USAGE", label: "disk usage", totalMbOf: (a) => a.diskTotalMb, forecast: getDiskGrowthForecast },
  { metric: "CAPACITY", label: "memory usage", totalMbOf: (a) => a.ramMb, forecast: getCapacityForecast },
];

let lastAgentCapacitySweepAt = 0;

function warningKey(agentId: string, metric: string): string {
  return `${agentId}:${metric}`;
}

// Live waehrend des Testens gefunden: eine REIN in-memory gefuehrte
// Hysterese (wie urspruenglich, analog zu Phase 49) erzeugt in DIESER
// Entwicklungsumgebung tatsaechlich Audit-Spam, da `tsx watch` bei JEDER
// Dateiaenderung neu startet und den In-Memory-Zustand jedes Mal verwirft -
// ein aktives Risiko wuerde dann bei jedem Neustart erneut als "neu
// erkannt" geschrieben. Deshalb hier die Audit-Historie selbst als
// autoritative Quelle (derselbe "juengster Eintrag gewinnt"-Ansatz wie
// Phase 44's Bestaetigungsstatus) - das In-Memory-Set bleibt zusaetzlich
// als billiger Kurzschluss (vermeidet die Audit-Abfrage im Normalfall,
// wenn der Zustand ohnehin schon bekannt ist), ist aber NICHT mehr die
// alleinige Quelle der Wahrheit.
async function isWarningCurrentlyActive(agentId: string, metric: string): Promise<boolean> {
  const entries = await listAuditLog({ category: "SYSTEM", limit: 200 });
  const relevant = entries.filter(
    (e) => (e.action === AGENT_CAPACITY_WARNING_ACTION || e.action === AGENT_CAPACITY_RECOVERED_ACTION) && e.metadata?.agentId === agentId && e.metadata?.metric === metric,
  );
  const sorted = [...relevant].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return sorted[sorted.length - 1]?.action === AGENT_CAPACITY_WARNING_ACTION;
}

const activeAgentCapacityWarnings = new Set<string>();

export async function evaluateAgentCapacityIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastAgentCapacitySweepAt < AGENT_CAPACITY_SWEEP_INTERVAL_MS) {
    return;
  }
  lastAgentCapacitySweepAt = now;

  const agents = await listMonitoringAgents();
  // Ein OFFLINE-Agent liefert nie wieder neue system_metrics-Stichproben -
  // sein Forecast ist eingefroren und wuerde ohne diesen Filter fuer immer
  // als "Risiko" gemeldet bleiben, ohne je natuerlich zu CLEARen (live
  // waehrend des Testens an einem echten, seit Tagen inaktiven
  // Alt-Agenten dieser Instanz beobachtet) - kein aktionierbares Signal.
  const onlineAgents = agents.filter((a) => a.status === "ONLINE");
  for (const agent of onlineAgents) {
    for (const spec of CAPACITY_METRICS) {
      const key = warningKey(agent.id, spec.metric);
      try {
        const totalMb = spec.totalMbOf(agent);
        const result = await spec.forecast(agent.id);
        const summary = buildForecastSummary(result, "LOWER_IS_BETTER");
        const projectedPercent =
          summary.projectedValue !== null && totalMb !== null && totalMb > 0 ? (summary.projectedValue / totalMb) * 100 : null;

        const isAtRisk = summary.sufficientData && summary.trend === "DEGRADING" && projectedPercent !== null && projectedPercent >= AGENT_CAPACITY_WARNING_THRESHOLD_PERCENT;
        const hasCleared = projectedPercent !== null && projectedPercent <= AGENT_CAPACITY_CLEAR_THRESHOLD_PERCENT;
        const wasActive = activeAgentCapacityWarnings.has(key) || (await isWarningCurrentlyActive(agent.id, spec.metric));

        if (isAtRisk && !wasActive) {
          activeAgentCapacityWarnings.add(key);
          const entry = await createAuditLogEntry({
            action: AGENT_CAPACITY_WARNING_ACTION,
            category: "SYSTEM",
            severity: "WARNING",
            message: `Agent "${agent.name}" is projected to reach ${Math.round(projectedPercent!)}% of its ${spec.label} capacity within ${summary.forecastDays} day(s) (R²=${result.rSquared}).`,
            metadata: {
              agentId: agent.id,
              agentName: agent.name,
              metric: spec.metric,
              projectedValue: summary.projectedValue,
              totalMb,
              projectedPercent,
              forecastDays: summary.forecastDays,
              recommendedAction:
                spec.metric === "DISK_USAGE"
                  ? "Free up disk space on this agent's host or provision additional storage before capacity is exhausted."
                  : "Investigate memory usage on this agent's host or provision additional memory before capacity is exhausted.",
            },
          });
          broadcast(createEvent(RealtimeEventType.AUDIT_CREATED, entry));
          void dispatchWebhookEvent("AGENT_CAPACITY_CHANGED", { state: "AT_RISK", agent, metric: spec.metric, projectedPercent });
        } else if (wasActive && hasCleared) {
          activeAgentCapacityWarnings.delete(key);
          const entry = await createAuditLogEntry({
            action: AGENT_CAPACITY_RECOVERED_ACTION,
            category: "SYSTEM",
            severity: "INFO",
            message: `Agent "${agent.name}" ${spec.label} is no longer trending toward capacity exhaustion.`,
            metadata: { agentId: agent.id, agentName: agent.name, metric: spec.metric, projectedPercent },
          });
          broadcast(createEvent(RealtimeEventType.AUDIT_CREATED, entry));
          void dispatchWebhookEvent("AGENT_CAPACITY_CHANGED", { state: "RECOVERED", agent, metric: spec.metric, projectedPercent });
        }
      } catch (err) {
        logger.error("Agent-Kapazitaets-Auswertung fehlgeschlagen", {
          agentId: agent.id,
          metric: spec.metric,
          error: err instanceof Error ? err.message : "Unbekannter Fehler",
        });
      }
    }
  }
}
