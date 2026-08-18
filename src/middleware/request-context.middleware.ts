import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { runWithRequestContext } from "../core/request-context";

// Muss vor jeder anderen Middleware/Route registriert werden (siehe
// index.ts) - alles danach (inkl. authenticate(), Route-Handler, Logger)
// laeuft innerhalb desselben AsyncLocalStorage-Kontexts und kann requestId/
// userId/projectId ohne manuelles Durchreichen mitloggen.
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  runWithRequestContext({ requestId }, next);
}
