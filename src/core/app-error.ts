// Phase 10 "Logging & Monitoring": einheitliche, absichtliche Fehler mit
// stabilem errorCode (fuer Frontend-Fehlerbehandlung/Monitoring-Dashboards)
// und HTTP-Status. Alles, was NICHT als AppError geworfen wird, gilt als
// unerwarteter interner Fehler (siehe middleware/error-handler.ts) - dessen
// Details landen ausschliesslich im Server-Log, nie in der Client-Antwort.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  // Phase 14 "Agent Authentication" (core/agent-auth.ts) - eigene Codes
  // statt AUTH_REQUIRED/FORBIDDEN wiederzuverwenden, da dies eine andere
  // Identitaet (Agent statt Benutzer) mit eigener Fehlersemantik ist.
  | "AGENT_AUTH_REQUIRED"
  | "AGENT_AUTH_INVALID"
  | "AGENT_AUTH_STALE"
  | "AGENT_REVOKED"
  | "TLS_REQUIRED"
  // Phase 16 (2. Iteration) - "QUOTA_EXCEEDED" von "RATE_LIMITED"
  // unterschieden: unterschiedliche Ursache (Business-Plan-Tageslimit vs.
  // Missbrauchsschutz pro Minute) und unterschiedliche Behebung fuer den
  // Aufrufer (naechsten Tag/Plan-Upgrade vs. kurz warten), verdient daher
  // einen eigenen, maschinenlesbaren Code statt denselben wiederzuverwenden.
  | "QUOTA_EXCEEDED"
  // Phase 17 Auftragspunkt 4 "Idempotency" - derselbe Idempotency-Key
  // wurde mit einem ANDEREN Request-Payload wiederverwendet (siehe
  // middleware/idempotency.ts). Explizit eigener Code, wie im Auftrag
  // gefordert.
  | "IDEMPOTENCY_KEY_REUSED"
  // Bewusst kein neuer Code fuer "APPROVAL_REQUIRED": eine externe
  // Execute-Anfrage gegen eine noch nicht genehmigte Aktion ist konzeptionell
  // derselbe Fall wie "gueltiger Request, aber die Vorbedingung fehlt noch" -
  // FORBIDDEN (403) passt semantisch und vermeidet einen weiteren Code nur
  // fuer diesen einen Grenzfall.
  ;

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function authRequiredError(message = "Nicht angemeldet"): AppError {
  return new AppError(401, "AUTH_REQUIRED", message);
}

export function forbiddenError(message = "Keine Berechtigung fuer diese Aktion"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFoundError(message = "Nicht gefunden"): AppError {
  return new AppError(404, "NOT_FOUND", message);
}
