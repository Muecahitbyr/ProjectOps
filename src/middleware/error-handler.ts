import type { NextFunction, Request, Response } from "express";
import { AppError } from "../core/app-error";
import { logger } from "../core/logger";

// Express 5 leitet abgelehnte Promises aus async Route-Handlern automatisch
// hierher weiter (kein asyncHandler-Wrapper mehr noetig). Muss als letzte
// Middleware registriert werden (siehe index.ts).
//
// Auftragspunkt 11 "Logging & Monitoring": AppErrors sind erwartete,
// oeffentlich beschreibbare Fehler (validiert, Berechtigung, nicht gefunden,
// ...) - ihre Nachricht darf an den Client. Alles andere ist ein
// unerwarteter interner Fehler: vollstaendig (inkl. Stacktrace) nur ins
// Server-Log, der Client bekommt ausschliesslich eine generische Meldung
// plus die requestId zum Nachschlagen im Log.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error(err.message, { code: err.code, details: err.details });
    } else {
      logger.warn(err.message, { code: err.code, details: err.details });
    }
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error("Unbehandelter Fehler", { message, stack });

  res.status(500).json({
    error: "Interner Serverfehler. Bitte spaeter erneut versuchen.",
    code: "INTERNAL_ERROR",
    requestId: res.getHeader("X-Request-Id"),
  });
}
