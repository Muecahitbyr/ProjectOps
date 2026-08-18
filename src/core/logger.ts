import { getRequestContext } from "./request-context";

type LogLevel = "info" | "warn" | "error" | "debug";

// Phase 10 "Logging & Monitoring": requestId/userId/projectId werden, falls
// innerhalb einer Anfrage vorhanden (siehe request-context.ts), automatisch
// in jeden Log-Eintrag gemischt - kein manuelles Durchreichen an jeder
// Aufrufstelle noetig.
function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const context = getRequestContext();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.userId ? { userId: context.userId } : {}),
    ...(context?.projectId ? { projectId: context.projectId } : {}),
    ...(meta ? { meta } : {}),
  };

  const output = JSON.stringify(entry);

  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
};
