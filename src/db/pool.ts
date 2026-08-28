import { Pool, types } from "pg";
import { logger } from "../core/logger";

// `pg` parst DATE-Spalten (OID 1082) standardmaessig zu einem JS-Date-Objekt
// in LOKALER Zeitzone - beim spaeteren .toISOString() (UTC) verschiebt sich
// ein reines Datum ohne Uhrzeit dadurch je nach Server-Zeitzone um einen
// Tag (z.B. "2026-09-01" wird zu "2026-08-31T22:00:00.000Z" in UTC+2, live
// beim Todo-Deadline-Feld reproduziert). Da ein DATE-Wert ohnehin keine
// Uhrzeit/Zeitzone traegt, ist der rohe String (YYYY-MM-DD) immer korrekt -
// kein Date-Objekt-Umweg noetig.
types.setTypeParser(1082, (value: string) => value);

// Phase 66 "Enterprise Final Hardening & Production Readiness" - dieselbe
// Fail-Fast-Konvention wie JWT_ACCESS_SECRET (config/auth.config.ts): ohne
// DATABASE_URL faellt `pg` sonst stillschweigend auf PGHOST/PGUSER/...
// zurueck (haeufig unbeabsichtigt, verwirrender Fehlschlag erst bei der
// ersten Anfrage) - in Production wird das jetzt sofort beim Start klar
// gemeldet statt eines spaeteren, schwer zuzuordnenden Verbindungsfehlers.
function resolveDatabaseUrl(): string | undefined {
  const configured = process.env.DATABASE_URL;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL fehlt - in Production erforderlich, siehe .env.example");
  }

  logger.warn(
    "DATABASE_URL nicht gesetzt - pg faellt auf PGHOST/PGUSER/PGPASSWORD/... Umgebungsvariablen zurueck (nur fuer Development empfohlen).",
  );
  return undefined;
}

export const pool = new Pool({
  connectionString: resolveDatabaseUrl(),
});

// Production Audit (nach Phase 27/28) - echter, live gefundener Bug: `pg`
// dokumentiert explizit, dass ein Fehler eines idle (eingecheckten) Clients
// im Pool (z.B. ein serverseitiger Verbindungsabbruch) ein 'error'-Event
// auf dem Pool selbst ausloest - ganz UNABHAENGIG von jeder einzelnen
// Anfrage. Ohne einen Listener hier wirft Node dieses Event synchron, was
// den Prozess abstuerzen liess ("This will crash your node process" -
// offizielle pg-Doku). Nur loggen und weiterlaufen, exakt dasselbe Prinzip
// wie die globalen unhandledRejection/uncaughtException-Handler in
// index.ts (Phase 27) - ein einzelner DB-Verbindungsfehler darf den
// gesamten Server niemals beenden.
pool.on("error", (err) => {
  logger.error("Unerwarteter Fehler eines idle DB-Pool-Clients - Prozess laeuft weiter", {
    error: err instanceof Error ? err.message : String(err),
  });
});
