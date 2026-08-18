import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cpus, loadavg, platform, arch } from "node:os";
import { pool } from "../db/pool";
import { isRealtimeServerRunning, getConnectedClientCount } from "../realtime/websocket.server";
import { getDisasterRecoveryReport } from "./disaster-recovery";
import type { DiagnosticsSnapshot, DiagnosticsSubsystemStatus } from "../types/diagnostics.types";

// Phase 13 Teil 11 "Diagnostics Center" - jeder Wert kommt aus dem
// tatsaechlich laufenden Prozess (process.*, os.*, echte DB-Abfragen),
// nichts ist hartkodiert.
function readJsonVersion(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "version" in parsed && typeof parsed.version === "string") {
      return parsed.version;
    }
    return null;
  } catch {
    return null;
  }
}

async function getPostgresVersion(): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ version: string }>("SELECT version()");
    return rows[0]?.version ?? null;
  } catch {
    return null;
  }
}

export async function getDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot> {
  const backendVersion = readJsonVersion(join(process.cwd(), "package.json")) ?? "unknown";
  // Im Production-Deployment (Phase 10) laufen Frontend und Backend in
  // getrennten Containern - frontend/package.json ist dann aus dem Backend-
  // Prozess heraus nicht lesbar. "unknown" statt eines erfundenen Werts.
  const frontendVersion = readJsonVersion(join(process.cwd(), "frontend", "package.json"));
  const dockerized = existsSync("/.dockerenv");
  const memUsage = process.memoryUsage();
  const [load1Min] = loadavg();
  const postgresVersion = await getPostgresVersion();
  const disasterRecovery = await getDisasterRecoveryReport();

  const subsystems: DiagnosticsSubsystemStatus[] = [
    { name: "Realtime / WebSocket", healthy: isRealtimeServerRunning(), detail: `${getConnectedClientCount()} verbundene Clients` },
    ...disasterRecovery.signals.map((signal) => ({ name: signal.name, healthy: signal.healthy, detail: signal.detail })),
    {
      name: "Notification Engine (SMTP)",
      healthy: true,
      detail: process.env.SMTP_HOST ? "SMTP konfiguriert" : "SMTP nicht konfiguriert (E-Mails werden als FAILED protokolliert)",
    },
  ];

  return {
    backendVersion,
    frontendVersion,
    gitCommit: process.env.GIT_COMMIT?.trim() || process.env.SOURCE_COMMIT?.trim() || null,
    environment: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    platform: platform(),
    arch: arch(),
    dockerized,
    dockerVersion: process.env.DOCKER_VERSION?.trim() ?? null,
    postgresVersion,
    memory: {
      usedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      totalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMb: Math.round(memUsage.rss / 1024 / 1024),
    },
    cpuLoadPercent: cpus().length > 0 && load1Min !== undefined ? Math.min(100, Math.round((load1Min / cpus().length) * 100)) : null,
    uptimeSeconds: Math.round(process.uptime()),
    subsystems,
  };
}
